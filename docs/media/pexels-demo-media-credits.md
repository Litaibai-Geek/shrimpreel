# Homepage demo media: Pexels sources and R2 setup

The homepage preview row uses three Pexels stock clips. Pexels states that its videos may be used in commercial projects. Do not imply that any depicted person endorses TinyDeskAI. The site labels these as licensed performance-reference footage, not AI-generated TinyDeskAI results.

## Sources

| Use | Creator | Original Pexels page | Source details |
|---|---|---|---|
| Band performance preview | RDNE Stock project | https://www.pexels.com/video/band-performance-at-the-recording-studio-8197864/ | 14s, 1080×1920, 30fps |
| Vocal close-up preview | ANTONI SHKRABA production | https://www.pexels.com/video/video-of-a-man-using-microphone-8042848/ | 8s, 2160×4096, 25fps |
| Saxophone solo preview | cottonbro studio | https://www.pexels.com/video/a-man-playing-his-saxophone-5657391/ | 4s, 2160×4096, 50fps |
| Kie reference input | cottonbro studio | https://www.pexels.com/video/a-woman-holding-the-microphone-while-singing-9419269/ | 26s source, 2160×4096, 25fps; trimmed to 14s for current Kie jobs and 18s for legacy jobs |

Pexels license: https://www.pexels.com/license/
Pexels commercial-use guidance: https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project

The download script removes the original audio track from every local video. This avoids carrying music from stock footage into the site's public demo or reference input. It creates small muted homepage previews in `public/demo/` and silent 720×1280 MP4 files in `seed/templates/`: 6s / 12s / 15s duration-matched clips for fal / yir / NanoAPI, one 14s fixed reference clip for Kie, and an 18s legacy clip.

## Download and prepare locally

Requires Node 24+ and FFmpeg on PATH:

```bash
npm run media:download
```

This command downloads the four Pexels source files, creates the preview MP4s/posters, prepares:

- `seed/templates/tiny-desk-v1-6s.mp4`, `tiny-desk-v1-12s.mp4`, `tiny-desk-v1-15s.mp4` — duration-matched source clips for fal / yir / NanoAPI
- `seed/templates/tiny-desk-v1-reference-14s.mp4` — fixed reference input for Kie 6 / 12 / 15-second outputs
- `seed/templates/tiny-desk-v1-18s.mp4` — legacy compatibility asset

It also changes `src/config/demo-media.ts` from Pexels CDN URLs to local `/demo/*` paths. Commit the generated `public/demo/*`, `seed/templates/*.mp4`, and updated config file together.

For local R2, run:

```bash
npm run seed:local
```

For the production R2 bucket named `tinydeskai-media`, upload the generated source videos:

```bash
npx wrangler r2 object put tinydeskai-media/templates/tiny-desk-v1-6s.mp4 --file seed/templates/tiny-desk-v1-6s.mp4 --content-type video/mp4
npx wrangler r2 object put tinydeskai-media/templates/tiny-desk-v1-12s.mp4 --file seed/templates/tiny-desk-v1-12s.mp4 --content-type video/mp4
npx wrangler r2 object put tinydeskai-media/templates/tiny-desk-v1-15s.mp4 --file seed/templates/tiny-desk-v1-15s.mp4 --content-type video/mp4
npx wrangler r2 object put tinydeskai-media/templates/tiny-desk-v1-reference-14s.mp4 --file seed/templates/tiny-desk-v1-reference-14s.mp4 --content-type video/mp4
npx wrangler r2 object put tinydeskai-media/templates/tiny-desk-v1-18s.mp4 --file seed/templates/tiny-desk-v1-18s.mp4 --content-type video/mp4
```

Do not use these stock clips as testimonials, imply the people endorse the product, or label them as AI-generated output. Replace the stock previews with genuine TinyDeskAI generation examples after a real Kie test succeeds.
