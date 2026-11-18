const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EMBEDDED_SOURCE_LENGTH = 190_000;
const MAX_IMAGE_DIMENSION = 1600;

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp"
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Le contenu de l’image est illisible."));
    });
    reader.addEventListener("error", () => reject(new Error("Impossible de lire l’image.")));
    reader.readAsDataURL(file);
  });
}

function decodeImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Impossible de décoder l’image.")));
    image.src = source;
  });
}

function isSupportedEmbeddedSource(source: string): boolean {
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/i.test(source);
}

function encodeOptimizedImage(image: HTMLImageElement): string {
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("L’image n’a pas de dimensions valides.");

  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Le navigateur ne peut pas préparer l’image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const quality = Math.max(0.38, 0.84 - attempt * 0.07);
    const result = canvas.toDataURL("image/webp", quality);
    if (result.length <= MAX_EMBEDDED_SOURCE_LENGTH) return result;
    scale *= 0.78;
  }

  throw new Error("L’image est trop volumineuse après compression. Essayez une image plus petite.");
}

export async function imageFileToEmbeddedSource(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Seuls les fichiers image peuvent être ajoutés au canvas.");
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error("L’image dépasse la taille maximale de 25 Mo.");

  const source = await readFileAsDataUrl(file);
  if (source.length <= MAX_EMBEDDED_SOURCE_LENGTH && isSupportedEmbeddedSource(source)) return source;
  return encodeOptimizedImage(await decodeImage(source));
}

export function imageMimeTypeFromPath(path: string): string | null {
  const filename = path.split(/[\\/]/).pop() ?? "";
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[extension] ?? null;
}

export function imageNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? "Image importée";
}

export async function imageBytesToEmbeddedSource(bytes: Uint8Array, mimeType: string, filename: string): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], filename, { type: mimeType });
  return imageFileToEmbeddedSource(file);
}
