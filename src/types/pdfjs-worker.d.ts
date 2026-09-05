declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  const workerModule: { WorkerMessageHandler: unknown };
  export = workerModule;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
