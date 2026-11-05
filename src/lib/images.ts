import config from "../../cms.config";

export interface PreparedImage {
  blob: Blob;
  fileName: string;
  originalName: string;
  converted: boolean;
  width: number;
  height: number;
}

function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpeg" ? "jpg" : ext;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (
    (dot <= 0 ? name : name.slice(0, dot))
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

export function uniqueImageName(fileName: string, forceExt?: string): string {
  const ext = forceExt ?? extensionOf(fileName);
  return `${Date.now().toString(36)}-${baseName(fileName)}.${ext}`;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const ext = extensionOf(file.name);
  const allowed = new Set(
    config.media.allowedExtensions.map((item) =>
      item === "jpeg" ? "jpg" : item,
    ),
  );
  if (!allowed.has(ext)) {
    throw new Error("Only png, jpg, webp, gif and svg files are accepted.");
  }
  if (file.size > config.media.maxBytes) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  if (ext === "png" || ext === "jpg") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, config.media.maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare image canvas.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (webp && webp.size < file.size) {
      return {
        blob: webp,
        fileName: uniqueImageName(file.name, "webp"),
        originalName: file.name,
        converted: true,
        width,
        height,
      };
    }
    return {
      blob: file,
      fileName: uniqueImageName(file.name, ext),
      originalName: file.name,
      converted: false,
      width,
      height,
    };
  }

  const dimensions = await imageDimensions(file).catch(() => ({
    width: 0,
    height: 0,
  }));
  return {
    blob: file,
    fileName: uniqueImageName(file.name, ext),
    originalName: file.name,
    converted: false,
    ...dimensions,
  };
}

async function imageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
