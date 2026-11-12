/**
 * Pictures a clipboard carries only inside its HTML.
 *
 * 🚨 PASTING A SCREENSHOT DID NOTHING (Claudius, 2026-11-12). Most tools put
 * a copied picture on the clipboard as a FILE, which FoF Upload's paste
 * listener uploads. Some put it only in the HTML, embedded in the image's
 * address: `<img src="data:image/png;base64,…">` and no file at all. FoF Upload
 * had nothing to upload, and the editor's image node does not take embedded
 * images (a post carrying megabytes of base64 is not a post), so the paste
 * went nowhere.
 *
 * So a paste that is nothing but such pictures hands them to the uploader as
 * files, as if they had been dropped. A paste with words in it keeps its
 * words and loses the embedded pictures, as before: a web page's base64
 * icons are not something to upload into a post.
 *
 * Kept free of the editor so the tests can run it in Node.
 */

/** Pictures an uploader takes. SVG is a document, not a picture, and stays out. */
const TYPES: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' };

/**
 * The pasted pictures as files, when the HTML holds those pictures and
 * nothing else; otherwise none.
 */
export function embeddedImages(doc: Document): File[] {
  const body = doc.body;
  if (!body || (body.textContent || '').trim()) return [];

  const images = Array.from(body.querySelectorAll('img'));
  if (!images.length) return [];

  const files: File[] = [];

  for (const img of images) {
    const match = /^data:image\/([a-z]+);base64,([a-z0-9+/=\s]+)$/i.exec((img.getAttribute('src') || '').trim());
    const ext = match && TYPES[match[1].toLowerCase()];
    // One picture that cannot be uploaded spoils the lot: the paste goes in as it is.
    if (!match || !ext) return [];

    try {
      const bytes = Uint8Array.from(atob(match[2].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
      files.push(new File([bytes], `image.${ext}`, { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }));
    } catch (e) {
      return [];
    }
  }

  return files;
}
