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

/**
 * Whether a pasted image's address is one a post can show: on the web, or
 * relative to the page it was copied from.
 *
 * 🚨 A PASTED blob: OR file: PICTURE WAS SAVED AS RAW HTML TEXT. Web apps
 * (Teams, Outlook on the web) copy a picture as `<img src="blob:…">`, an
 * address that only exists inside their own tab, and Word copies its pictures
 * as `file:///C:/…`, a path on the copier's own disk. The editor showed a
 * broken picture, and the server, which only takes web addresses, kept the
 * whole tag as literal text in the post. So only addresses that work for
 * every reader are allowed, not a list of the ones that don't.
 */
export function isWebImage(src: string): boolean {
  const address = src.trim();
  return /^https?:\/\//i.test(address) || !/^[a-z][a-z0-9+.-]*:/i.test(address);
}

/** Whether the HTML is nothing but pictures, none of them with a web address. */
export function unreachableImagesOnly(doc: Document): boolean {
  const body = doc.body;
  if (!body || (body.textContent || '').trim()) return false;

  const images = Array.from(body.querySelectorAll('img'));
  return images.length > 0 && images.every((img) => !isWebImage(img.getAttribute('src') || ''));
}
