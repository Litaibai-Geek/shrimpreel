// Licensed Pexels footage used as visual performance references on the homepage.
// These are stock clips, not AI-generated TinyDeskAI outputs. Run npm run media:download
// to self-host the clips under public/demo/ and replace these CDN URLs with local paths.
export const demoMedia = {
  band: {
    label: 'Band performance',
    video: 'https://videos.pexels.com/video-files/8197864/8197864-hd_1080_1920_30fps.mp4',
    poster: 'https://images.pexels.com/videos/8197864/pexels-photo-8197864.jpeg?auto=compress&dpr=1&h=750&w=1260',
    credit: 'Pexels · RDNE Stock project',
  },
  singer: {
    label: 'Vocal close-up',
    video: 'https://videos.pexels.com/video-files/8042848/8042848-uhd_2160_4096_25fps.mp4',
    poster: 'https://images.pexels.com/videos/8042848/band-concert-cool-dark-8042848.jpeg?auto=compress&dpr=1&h=750&w=1260',
    credit: 'Pexels · ANTONI SHKRABA production',
  },
  sax: {
    label: 'Saxophone solo',
    video: 'https://videos.pexels.com/video-files/5657391/5657391-uhd_2160_4096_25fps.mp4',
    poster: 'https://images.pexels.com/videos/5657391/pexels-photo-5657391.jpeg?auto=compress&dpr=1&h=750&w=1260',
    credit: 'Pexels · cottonbro studio',
  },
} as const
