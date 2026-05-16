/**
 * Igual ao @signpdf/placeholder-plain, mas coloca o widget na página indicada
 * (abaixo da assinatura do paciente no termo).
 */

import { pdfkitAddPlaceholder } from "@signpdf/placeholder-pdfkit010";
// Imports diretos do dist (evita createRequire que quebra no deploy Vercel/Turbopack).
import readPdf from "@signpdf/placeholder-plain/dist/readPdf";
import getIndexFromRef from "@signpdf/placeholder-plain/dist/getIndexFromRef";
import findObject from "@signpdf/placeholder-plain/dist/findObject";
import getPagesDictionaryRef from "@signpdf/placeholder-plain/dist/getPagesDictionaryRef";
import createBufferRootWithAcroform from "@signpdf/placeholder-plain/dist/createBufferRootWithAcroform";
import createBufferPageWithAnnotation from "@signpdf/placeholder-plain/dist/createBufferPageWithAnnotation";
import createBufferTrailer from "@signpdf/placeholder-plain/dist/createBufferTrailer";
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

const readPdfFn = (readPdf as { default?: (pdf: Buffer) => PdfInfo }).default ?? readPdf;
const getIndexFromRefFn =
  (getIndexFromRef as { default?: typeof getIndexFromRef }).default ?? getIndexFromRef;
const findObjectFn = (findObject as { default?: typeof findObject }).default ?? findObject;
const getPagesDictionaryRefFn =
  (getPagesDictionaryRef as { default?: typeof getPagesDictionaryRef }).default ??
  getPagesDictionaryRef;
const createBufferRootWithAcroformFn =
  (createBufferRootWithAcroform as { default?: typeof createBufferRootWithAcroform }).default ??
  createBufferRootWithAcroform;
const createBufferPageWithAnnotationFn =
  (createBufferPageWithAnnotation as { default?: typeof createBufferPageWithAnnotation }).default ??
  createBufferPageWithAnnotation;
const createBufferTrailerFn =
  (createBufferTrailer as { default?: typeof createBufferTrailer }).default ?? createBufferTrailer;

function getAcroFormRef(slice: string): string | undefined {
  const match = /\/AcroForm\s+(\d+\s\d+\s+R)/g.exec(slice);
  return match?.[1] ?? undefined;
}

function obterRefPagina(pdfBuffer: Buffer, info: PdfInfo, pageIndex?: number): string {
  const pagesRef = getPagesDictionaryRefFn(info);
  const pagesDictionary = findObjectFn(pdfBuffer, info.xref as never, pagesRef);
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
  const info = readPdfFn(pdf);
  const pageRef = obterRefPagina(pdf, info, pageIndexOpt);
  const pageIndex = getIndexFromRefFn(info.xref, pageRef);
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
    const rootIndex = getIndexFromRefFn(info.xref, info.rootRef);
    addedReferences.set(rootIndex, pdf.length + 1);
    pdf = Buffer.concat([
      pdf,
      Buffer.from("\n"),
      createBufferRootWithAcroformFn(pdf, info as never, form),
    ]);
  }

  addedReferences.set(pageIndex, pdf.length + 1);
  pdf = Buffer.concat([
    pdf,
    Buffer.from("\n"),
    createBufferPageWithAnnotationFn(pdf, info as never, pageRef, widget),
  ]);
  pdf = Buffer.concat([
    pdf,
    Buffer.from("\n"),
    createBufferTrailerFn(pdf, info as never, addedReferences),
  ]);
  return pdf;
}
