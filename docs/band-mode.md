# Band mode (2–5 people)

## Flow
- Solo remains unchanged. Band accepts 2–5 distinct, authorized adult images in this fixed order: lead singer, keyboard, saxophone, backing singer, drummer. The first image stays in generations.upload_id, and all ordered image IDs live in generations.provider_meta.band.uploadIds so a D1 migration is not required.
- The API validates photo ownership, active upload state, count, distinct upload IDs, and duplicate image SHA-256 before debiting credits. Rate limiting and the existing queued job limit still apply.
- The job signs all selected image URLs, submits them with Kie Seedance 2.0 Mini reference_image_urls plus the configured reference video, and retains the band IDs across provider responses for job recovery and retention. The cleanup sweep does not expire extra images while a Band job is queued or processing.
- Credit price remains 1 credit/second in this MVP; the existing queue, provider callback/polling, R2 output, 45-minute timeout and failure-refund logic are shared with Solo.
- Prompts provide role hints, but Seedance Mini does **not** guarantee each face/role or full ensemble appears accurately. Results must be checked in production before advertising guaranteed multi-person face swaps.
- The group picker starts with file selection order. Left/right controls allow moving each portrait into its intended numbered role without re-uploading. The user can reselect photos to replace the entire group. Band does not modify or download the homepage demonstration media.

## Local verification before deployment
1. Run npm ci, npm run typecheck, npm test, npm run build, and npm run doctor.
2. Test existing Solo flow, then upload 2, 3 and 5 separate adult photos. Confirm roles in file-order preview, that generation memberCount matches, and that Kie receives 2/3/5 ordered image URLs.
3. Test duplicate photo content, a foreign-user upload ID, missing IDs, 1/6 photos, insufficient credits, 3 concurrent jobs, and a failure/refund including duplicate webhook delivery.
4. Confirm signed photo URLs remain accessible to Kie throughout processing and inaccessible to anonymous unsigned requests.
5. Check /dashboard shows Band labels, share/download playback works, and retention does not remove an active Band member image.
6. Run a genuine 15-second, 720p Band render and verify role/identity consistency, the reference scene and audio. Treat inaccurate AI output as a model limitation, not an API success guarantee.
7. Perform database and R2 backups, then manually deploy when the environment-specific validation passes.
