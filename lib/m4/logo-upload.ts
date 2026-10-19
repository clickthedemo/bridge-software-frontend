export const DIRECTORY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const DIRECTORY_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function validateDirectoryLogo(file: Pick<File, "size" | "type"> | null): string | null {
  if (!file) return "Choose a logo image.";
  if (!DIRECTORY_LOGO_TYPES.includes(file.type as (typeof DIRECTORY_LOGO_TYPES)[number])) return "Choose a PNG, JPEG, or WebP image.";
  if (file.size > DIRECTORY_LOGO_MAX_BYTES) return "Choose an image no larger than 2 MiB.";
  if (file.size < 1) return "Choose a non-empty image file.";
  return null;
}

export function putDirectoryLogo(signedUrl: string, headers: Record<string, string>, file: File, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.withCredentials = false;
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error("The logo could not be uploaded to storage."));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("The logo could not be uploaded to storage."));
    request.send(file);
  });
}
