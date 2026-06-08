import type { OutputFormat } from '../types';

export interface ToolContent {
  slug: string;
  format: OutputFormat;
  title: string;        // <title> / H1
  description: string;  // meta description
  intro: string;        // ~120 words above the tool
  body: string[];       // paragraphs of how-to / why (renders below the tool)
  faq: { q: string; a: string }[];
}

export const TOOLS: Record<string, ToolContent> = {
  'heic-to-jpg': {
    slug: 'heic-to-jpg',
    format: 'jpg',
    title: 'HEIC to JPG Converter — Free, Private, In Your Browser',
    description: 'Convert HEIC photos from your iPhone to JPG instantly. 100% free, no upload — your images never leave your device.',
    intro: 'HEIC is the photo format iPhones use by default, but Windows, older Android phones, and many websites cannot open it. This free converter turns HEIC into universally supported JPG right inside your browser — your photos are never uploaded to a server.',
    body: [
      'To convert, drag your .HEIC files into the box above (or tap to choose them). Each file is decoded and re-saved as a JPG on your own device, then offered for download. You can convert many photos at once and download them together as a zip.',
      'Because everything runs locally using WebAssembly, the tool works even offline once loaded, and none of your photos are ever sent anywhere. That makes it safe for personal and sensitive images.',
      'JPG is the best choice when you want maximum compatibility and small file sizes for sharing or uploading. If you need lossless quality or transparency, use the HEIC to PNG converter instead; for documents, use HEIC to PDF.',
    ],
    faq: [
      { q: 'Are my photos uploaded anywhere?', a: 'No. Conversion happens entirely in your browser using WebAssembly. Your files never leave your device.' },
      { q: 'Why won\'t my HEIC files open on Windows?', a: 'HEIC is an Apple-preferred format. Many Windows and Android apps lack a HEIC decoder, so converting to JPG makes the photos open everywhere.' },
      { q: 'Is there a limit on how many files I can convert?', a: 'You can convert many at once. Very large images (over 50 MB each) may be skipped to avoid running out of memory in the browser.' },
    ],
  },
  'heic-to-png': {
    slug: 'heic-to-png',
    format: 'png',
    title: 'HEIC to PNG Converter — Free, Private, In Your Browser',
    description: 'Convert iPhone HEIC photos to lossless PNG instantly. Free, no upload — files stay on your device.',
    intro: 'Convert HEIC images to PNG, a lossless format with wide support and transparency. Everything runs in your browser, so your photos are never uploaded.',
    body: [
      'Drag your .HEIC files into the box above to convert them to PNG on your own device, then download them individually or together as a zip.',
      'PNG preserves full image quality without compression artifacts, which is useful for editing or graphics. For smaller files better suited to sharing, convert to JPG instead.',
      'All processing happens locally with WebAssembly — no server, no upload, works offline once loaded.',
    ],
    faq: [
      { q: 'Does PNG keep full quality?', a: 'Yes. PNG is lossless, so the converted image keeps the full quality decoded from the HEIC.' },
      { q: 'Are my files uploaded?', a: 'No. Conversion runs entirely in your browser; your files never leave your device.' },
      { q: 'PNG or JPG — which should I pick?', a: 'Choose PNG for lossless quality or transparency; choose JPG for smaller files and easier sharing.' },
    ],
  },
  'heic-to-pdf': {
    slug: 'heic-to-pdf',
    format: 'pdf',
    title: 'HEIC to PDF Converter — Free, Private, In Your Browser',
    description: 'Turn iPhone HEIC photos into PDF documents instantly. Free, no upload — your images stay on your device.',
    intro: 'Convert HEIC photos into PDF documents, one page per image, entirely in your browser. Nothing is uploaded.',
    body: [
      'Drag your .HEIC files into the box above. Each photo becomes a single-page PDF on your device, ready to download or bundle together as a zip.',
      'PDF is ideal when you need to print, email, or submit a photo as a document. The image is embedded at full resolution.',
      'Processing is fully local using WebAssembly, so your images are never sent to a server and the tool works offline once loaded.',
    ],
    faq: [
      { q: 'Does each photo become its own PDF?', a: 'Yes. Each HEIC image is converted into its own single-page PDF; convert several and download them together as a zip.' },
      { q: 'Are my files uploaded?', a: 'No. Everything runs in your browser; your files never leave your device.' },
      { q: 'Will the PDF keep full image quality?', a: 'Yes. The photo is embedded into the PDF at its decoded resolution.' },
    ],
  },
};

export const COMPRESS_CONTENT = {
  slug: 'compress-image',
  title: 'Compress Image — Free, Private, In Your Browser',
  description: 'Compress JPG, PNG, WebP, and HEIC images to shrink file size without uploading. 100% free, runs entirely in your browser.',
  intro: 'Reduce the file size of your JPG, PNG, WebP, and HEIC images right in your browser. Drag your photos in, pick a quality level, and download smaller files — nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Each image is re-compressed on your own device and offered for download, with the before-and-after size shown. Compress many at once and download them together as a zip.',
    'JPG and WebP images are re-encoded at your chosen quality; PNG images are shrunk by reducing their color palette (the same technique tools like TinyPNG use); HEIC images are compressed and saved as JPG, since browsers cannot write HEIC. Lower the quality slider for smaller files, raise it for higher fidelity.',
    'Because everything runs locally using WebAssembly and your browser, the tool works offline once loaded and none of your images are ever sent anywhere — safe for personal and sensitive photos.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Compression happens entirely in your browser. Your files never leave your device.' },
    { q: 'Which formats can I compress?', a: 'JPG, PNG, WebP, and HEIC. HEIC images are saved as compressed JPG because browsers cannot write the HEIC format.' },
    { q: 'Why did my PNG only shrink a little?', a: 'PNG is lossless, so we shrink it by reducing the color palette. Photos with many colors compress more; simple graphics that are already small may change little.' },
    { q: 'What if compression would make the file bigger?', a: 'We never hand back a larger file. If re-compressing would not help, the original is kept and the row is marked "already optimized".' },
  ],
};

export const RESIZE_CONTENT = {
  slug: 'resize-image',
  title: 'Resize Image — Free, Private, In Your Browser',
  description: 'Resize JPG, PNG, WebP, and HEIC images to exact pixel dimensions without uploading. 100% free, runs entirely in your browser.',
  intro: 'Change the width and height of your JPG, PNG, WebP, and HEIC images right in your browser. Set a target size, keep the aspect ratio locked or free, and download — nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Enter a width or height in pixels; with aspect ratio locked, each image keeps its proportions, so a whole batch can be resized to the same width at once. Turn the lock off to set an exact width and height.',
    'Each resized image shows its old and new dimensions and is offered for download. Resize many at once and download them together as a zip. HEIC images are saved as JPG, since browsers cannot write the HEIC format.',
    'Because everything runs locally in your browser, the tool works offline once loaded and none of your images are ever sent anywhere — safe for personal and sensitive photos.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Resizing happens entirely in your browser. Your files never leave your device.' },
    { q: 'Which formats can I resize?', a: 'JPG, PNG, WebP, and HEIC. HEIC images are saved as JPG because browsers cannot write the HEIC format.' },
    { q: 'How do I keep the aspect ratio?', a: 'Leave "Lock aspect ratio" on and set just one dimension — the other is calculated automatically so the image is not stretched.' },
    { q: 'Can I make an image larger?', a: 'Yes. You can enlarge as well as shrink, though enlarging cannot add detail that was not in the original.' },
  ],
};

export const REMOVE_BG_CONTENT = {
  slug: 'remove-background',
  title: 'Remove Image Background — Free, Private, In Your Browser',
  description: 'Remove the background from any image and download a transparent PNG — free, no upload. Runs entirely in your browser, so your photos never leave your device.',
  intro: 'Erase the background from your JPG, PNG, WebP, and HEIC images right in your browser and get a clean transparent PNG. 100% free, no account, and nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Each image is processed on your own device and shown with a checkerboard preview so you can see the cut-out before downloading. Remove the background from many at once and download them together as a zip.',
    'The first image loads a small one-time AI model (about 5 MB), so it takes a few seconds; after that the rest are quick. Results are saved as transparent PNGs and work well for people, products, and objects.',
    'Because everything runs locally in your browser — even the AI model is served from this site, not a third party — none of your images are ever sent anywhere. That makes it safe for personal and sensitive photos, and it works offline once loaded.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Background removal runs entirely in your browser, and even the AI model is served from this site rather than a third party. Your files never leave your device.' },
    { q: 'Why is the first image slower?', a: 'The first image downloads a small one-time model (about 5 MB) and starts it up. Your browser caches it, so every image after that is much faster.' },
    { q: 'What formats can I use, and what do I get back?', a: 'You can drop in JPG, PNG, WebP, and HEIC images. The result is always a transparent PNG, since PNG is the universal format that supports transparency.' },
    { q: 'Does it work on people and products?', a: 'Yes. The model is general-purpose and handles people, products, and other objects. Very fine details like loose hair may not be perfect.' },
  ],
};
