"use client"

import { pdfjs } from "react-pdf"

// Point react-pdf at the worker shipped with pdfjs-dist. Using unpkg keeps the
// worker out of our Next bundle; change to a self-hosted path if offline.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export const PDF_WORKER_VERSION = pdfjs.version
