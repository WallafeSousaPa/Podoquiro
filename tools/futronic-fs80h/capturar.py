#!/usr/bin/env python3
"""Captura imagem do leitor Futronic FS80H (ftrScanAPI.dll). Saída: JSON no stdout."""

from __future__ import annotations

import argparse
import base64
import ctypes
import json
import os
import sys
import time
from ctypes import POINTER, Structure, byref, c_int, c_ubyte, c_void_p

ERROS = {
    4306: "Nenhuma digital no sensor (quadro vazio).",
    0x20000001: "O dedo se moveu durante a leitura.",
    0x20000002: "Nenhum quadro disponível no leitor.",
    0x20000003: "Leitura cancelada.",
    0x20000004: "Hardware incompatível.",
    0x20000005: "Firmware incompatível.",
}


class FTRSCAN_IMAGE_SIZE(Structure):
    _fields_ = [
        ("nWidth", c_int),
        ("nHeight", c_int),
        ("nImageSize", c_int),
    ]


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(mensagem: str, **extra: object) -> int:
    emit({"ok": False, "error": mensagem, **extra})
    return 1


def candidatos_dll(explicito: str | None) -> list[str]:
    raiz = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    env = os.environ.get("FUTRONIC_SCANAPI_DLL", "").strip()
    lista = [
        explicito or "",
        env,
        os.path.join(os.path.dirname(__file__), "ftrScanAPI.dll"),
        os.path.join(os.path.dirname(__file__), "x64", "ftrScanAPI.dll"),
        os.path.join(raiz, "tools", "futronic-fs80h", "ftrScanAPI.dll"),
        os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "ftrScanAPI.dll"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Futronic", "ftrScanAPI.dll"),
        os.path.join(
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            "Futronic",
            "ftrScanAPI.dll",
        ),
    ]
    vistos: list[str] = []
    for item in lista:
        if not item:
            continue
        caminho = os.path.abspath(item)
        if caminho not in vistos:
            vistos.append(caminho)
    return vistos


def achar_dll(explicito: str | None) -> str | None:
    for caminho in candidatos_dll(explicito):
        if os.path.isfile(caminho):
            return caminho
    return None


def carregar_lib(dll_path: str) -> ctypes.WinDLL:
    pasta = os.path.dirname(dll_path)
    if pasta and hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(pasta)
        except OSError:
            pass
    return ctypes.WinDLL(dll_path)


def configurar_api(lib: ctypes.WinDLL) -> None:
    lib.ftrScanOpenDevice.restype = c_void_p
    lib.ftrScanOpenDevice.argtypes = []
    lib.ftrScanCloseDevice.restype = None
    lib.ftrScanCloseDevice.argtypes = [c_void_p]
    lib.ftrScanGetImageSize.restype = c_int
    lib.ftrScanGetImageSize.argtypes = [c_void_p, POINTER(FTRSCAN_IMAGE_SIZE)]
    lib.ftrScanGetImage.restype = c_int
    lib.ftrScanGetImage.argtypes = [c_void_p, c_int, c_void_p]
    lib.ftrScanGetFrame.restype = c_int
    lib.ftrScanGetFrame.argtypes = [c_void_p, c_void_p, c_void_p]
    lib.ftrScanIsFingerPresent.restype = c_int
    lib.ftrScanIsFingerPresent.argtypes = [c_void_p, c_void_p]
    lib.ftrScanSetDiodesStatus.restype = c_int
    lib.ftrScanSetDiodesStatus.argtypes = [c_void_p, c_ubyte, c_ubyte]
    lib.ftrScanGetLastError.restype = ctypes.c_uint
    lib.ftrScanGetLastError.argtypes = []


def mensagem_erro(lib: ctypes.WinDLL) -> str:
    codigo = int(lib.ftrScanGetLastError())
    texto = ERROS.get(codigo, f"Erro do leitor (código {codigo}).")
    return texto


def abrir_dispositivo(lib: ctypes.WinDLL) -> c_void_p | None:
    return lib.ftrScanOpenDevice() or None


def status(lib: ctypes.WinDLL) -> int:
    handle = abrir_dispositivo(lib)
    if not handle:
        return fail(
            "Leitor Futronic FS80H não encontrado. Confira o USB, o driver e se a DLL é x64.",
            conectado=False,
        )
    try:
        tamanho = FTRSCAN_IMAGE_SIZE()
        largura = 0
        altura = 0
        if lib.ftrScanGetImageSize(handle, byref(tamanho)):
            largura = int(tamanho.nWidth)
            altura = int(tamanho.nHeight)
        emit(
            {
                "ok": True,
                "conectado": True,
                "leitor": "Futronic FS80H",
                "width": largura,
                "height": altura,
                "dllPath": None,
            }
        )
        return 0
    finally:
        lib.ftrScanCloseDevice(handle)


def capturar(lib: ctypes.WinDLL, timeout_sec: float) -> int:
    handle = abrir_dispositivo(lib)
    if not handle:
        return fail(
            "Leitor Futronic FS80H não encontrado. Confira o USB, o driver e se a DLL é x64.",
            conectado=False,
        )
    try:
        lib.ftrScanSetDiodesStatus(handle, 50, 0)
        tamanho = FTRSCAN_IMAGE_SIZE()
        if not lib.ftrScanGetImageSize(handle, byref(tamanho)):
            return fail(mensagem_erro(lib))
        if tamanho.nImageSize <= 0:
            return fail("O leitor não informou o tamanho da imagem.")

        limite = time.time() + max(3.0, timeout_sec)
        while time.time() < limite:
            if lib.ftrScanIsFingerPresent(handle, None):
                break
            time.sleep(0.08)
        else:
            return fail("Tempo esgotado. Coloque o dedo no leitor FS80H e tente de novo.")

        time.sleep(0.35)
        buffer = ctypes.create_string_buffer(tamanho.nImageSize)
        melhor = None
        melhor_var = -1.0
        captura_ate = min(limite, time.time() + 2.4)
        while time.time() < captura_ate:
            ok = bool(lib.ftrScanGetImage(handle, 4, buffer))
            if not ok:
                ok = bool(lib.ftrScanGetFrame(handle, buffer, None))
            if ok:
                n = int(tamanho.nWidth) * int(tamanho.nHeight)
                amostra = buffer.raw[:n]
                passo = 8
                vals = amostra[::passo]
                media = sum(vals) / max(1, len(vals))
                var = sum((px - media) ** 2 for px in vals) / max(1, len(vals))
                if var > melhor_var:
                    melhor = bytes(amostra)
                    melhor_var = var
                if var >= 1800:
                    break
            time.sleep(0.08)

        if melhor is None:
            return fail(mensagem_erro(lib))

        pixels = melhor[: tamanho.nWidth * tamanho.nHeight]
        emit(
            {
                "ok": True,
                "conectado": True,
                "leitor": "Futronic FS80H",
                "width": int(tamanho.nWidth),
                "height": int(tamanho.nHeight),
                "pixelsBase64": base64.b64encode(pixels).decode("ascii"),
            }
        )
        return 0
    finally:
        try:
            lib.ftrScanSetDiodesStatus(handle, 0, 0)
        except Exception:
            pass
        lib.ftrScanCloseDevice(handle)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser()
    parser.add_argument("--acao", choices=("status", "capturar"), default="status")
    parser.add_argument("--dll", default="")
    parser.add_argument("--timeout", type=float, default=18.0)
    args = parser.parse_args()

    dll_path = achar_dll(args.dll or None)
    if not dll_path:
        return fail(
            "Não achei a ftrScanAPI.dll. Copie a DLL x64 do SDK Futronic FS80H para "
            "tools/futronic-fs80h/ftrScanAPI.dll (ou defina FUTRONIC_SCANAPI_DLL).",
            conectado=False,
            dllProcurada=candidatos_dll(args.dll or None),
        )

    try:
        lib = carregar_lib(dll_path)
        configurar_api(lib)
    except OSError as exc:
        return fail(
            f"Não foi possível carregar a DLL ({dll_path}). Use a versão x64 da ftrScanAPI.dll. {exc}",
            conectado=False,
            dllPath=dll_path,
        )

    if args.acao == "status":
        codigo = status(lib)
    else:
        codigo = capturar(lib, args.timeout)

    if codigo == 0:
        # inclui o caminho da DLL no último JSON? já emitimos. ok.
        pass
    return codigo


if __name__ == "__main__":
    raise SystemExit(main())
