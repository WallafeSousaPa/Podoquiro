/**
 * Igual ao @signpdf/placeholder-plain, mas coloca o widget na última página
 * (página do retângulo de assinatura digital da clínica).
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pdfkitAddPlaceholder } from "@signpdf/placeholder-pdfkit010";
import {
  DEFAULT_SIGNATURE_LENGTH,
  PDFKitReferenceMock,
  PDFObject,
  removeTrailingNewLine,
  SUBFILTER_ADOBE_PKCS7_DETACHED,
} from "@signpdf/utils";

type PdfInfo = {
  xref: { maxIndex: number; offsets: Map<number, number> };
  rootRef: string;
  root: Buffer;
  infoRef: string;
  trailerStart: number;
};

/** Caminho absoluto real (compatível com Turbopack/Next.js). */
function criarRequirePlaceholderPlain(): NodeRequire {
  const pkgJson = path.join(
    process.cwd(),
    "node_modules",
    "@signpdf",
    "placeholder-plain",
    "package.json",
  );
  if (!fs.existsSync(pkgJson)) {
    throw new Error(
      "Dependência @signpdf/placeholder-plain não encontrada em node_modules.",
    );
  }
  return createRequire(pkgJson);
}

const requireSignpdfPlain = criarRequirePlaceholderPlain();

const readPdf = requireSignpdfPlain("./dist/readPdf").default as (pdf: Buffer) => PdfInfo;
const getIndexFromRef = requireSignpdfPlain("./dist/getIndexFromRef").default as (
  xref: { offsets: Map<number, number> },
  ref: string,
) => number;
const findObject = requireSignpdfPlain("./dist/findObject").default as (
  pdf: Buffer,
  xref: { offsets: Map<number, number> },
  ref: string,
) => Buffer;
const getPagesDictionaryRef = requireSignpdfPlain("./dist/getPagesDictionaryRef").default as (
  info: { root: Buffer },
) => string;
const createBufferRootWithAcroform = requireSignpdfPlain("./dist/createBufferRootWithAcroform")
  .default as (pdf: Buffer, info: unknown, form: unknown) => Buffer;
const createBufferPageWithAnnotation = requireSignpdfPlain(
  "./dist/createBufferPageWithAnnotation",
).default as (pdf: Buffer, info: unknown, pageRef: string, widget: unknown) => Buffer;
const createBufferTrailer = requireSignpdfPlain("./dist/createBufferTrailer").default as (
  pdf: Buffer,
  info: unknown,
  addedReferences: Map<number, number>,
) => Buffer;

function getAcroFormRef(slice: string): string | undefined {
  const match = /\/AcroForm\s+(\d+\s\d+\s+R)/g.exec(slice);
  return match?.[1] ?? undefined;
}

function obterRefPagina(pdfBuffer: Buffer, info: PdfInfo, pageIndex?: number): string {
  const pagesRef = getPagesDictionaryRef(info);
  const pagesDictionary = findObject(pdfBuffer, info.xref, pagesRef);
  const kidsPosition = pagesDictionary.indexOf("/Kids");
  const kidsStart = pagesDictionary.indexOf("[", kidsPosition) + 1;
  const kidsEnd = pagesDictionary.indexOf("]", kidsPosition);
  const kidsSlice = pagesDictionary.slice(kidsStart, kidsEnd).toString();
  const refs = kidsSlice.match(/\d+\s+\d+\s+R/g);
  if (!refs?.length) {
    throw new Error("Não foi possível localizar páginas no PDF do termo.");
  }
  const idx =
    pageIndex !== undefined && pageIndex >= 0 && pageIndex < refs.length
      ? pageIndex
      : refs.length - 1;
  return refs[idx]!;
}

export type PlainAddPlaceholderUltimaPaginaOpts = {
  pdfBuffer: Buffer;
  reason: string;
  contactInfo: string;
  name: string;
  location: string;
  signingTime?: Date;
  signatureLength?: number;
  subFilter?: string;
  widgetRect?: [number, number, number, number];
  appName?: string;
  /** Página do widget (0 = primeira). Padrão: última. */
  pageIndex?: number;
};

export function plainAddPlaceholderUltimaPagina({
  pdfBuffer,
  reason,
  contactInfo,
  name,
  location,
  signingTime,
  signatureLength = DEFAULT_SIGNATURE_LENGTH,
  subFilter = SUBFILTER_ADOBE_PKCS7_DETACHED,
  widgetRect = [0, 0, 0, 0],
  appName,
  pageIndex: pageIndexOpt,
}: PlainAddPlaceholderUltimaPaginaOpts): Buffer {
  let pdf = removeTrailingNewLine(pdfBuffer);
  const info = readPdf(pdf);
  const pageRef = obterRefPagina(pdf, info, pageIndexOpt);
  const pageIndex = getIndexFromRef(info.xref, pageRef);
  const addedReferences = new Map<number, number>();

  const pdfKitMock = {
    ref: (input: object, knownIndex?: number) => {
      info.xref.maxIndex += 1;
      const index = knownIndex ?? info.xref.maxIndex;
      addedReferences.set(index, pdf.length + 1);
      pdf = Buffer.concat([
        pdf,
        Buffer.from("\n"),
        Buffer.from(`${index} 0 obj\n`),
        Buffer.from(PDFObject.convert(input)),
        Buffer.from("\nendobj\n"),
      ]);
      return new PDFKitReferenceMock(info.xref.maxIndex);
    },
    page: {
      dictionary: new PDFKitReferenceMock(pageIndex, {
        data: { Annots: [] },
      }),
    },
    _root: { data: {} as { AcroForm?: string } },
  };

  const acroFormRef = getAcroFormRef(info.root.toString());
  if (acroFormRef) {
    pdfKitMock._root.data.AcroForm = acroFormRef;
  }

  const { form, widget } = pdfkitAddPlaceholder({
    pdf: pdfKitMock,
    pdfBuffer,
    reason,
    contactInfo,
    name,
    location,
    signingTime,
    signatureLength,
    subFilter,
    widgetRect,
    appName,
  });

  if (!getAcroFormRef(pdf.toString())) {
    const rootIndex = getIndexFromRef(info.xref, info.rootRef);
    addedReferences.set(rootIndex, pdf.length + 1);
    pdf = Buffer.concat([
      pdf,
      Buffer.from("\n"),
      createBufferRootWithAcroform(pdf, info, form),
    ]);
  }

  addedReferences.set(pageIndex, pdf.length + 1);
  pdf = Buffer.concat([
    pdf,
    Buffer.from("\n"),
    createBufferPageWithAnnotation(pdf, info, pageRef, widget),
  ]);
  pdf = Buffer.concat([
    pdf,
    Buffer.from("\n"),
    createBufferTrailer(pdf, info, addedReferences),
  ]);
  return pdf;
}
