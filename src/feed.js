const { logActivity } = require('./logger');

async function fetchPostMetadata(lang_group, cookie) {
  if (!lang_group) return null;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (cookie) {
    headers['Cookie'] = `token=${cookie}`;
  }
  try {
    const params = new URLSearchParams();
    params.append('lang_group', lang_group.toString());
    params.append('language', 'en');

    const response = await fetch('https://live.warthunder.com/api/posts/get/', {
      method: 'POST',
      headers,
      body: params.toString()
    });

    if (response.ok) {
      const data = await response.json();
      return {
        likes: data.likes || 0,
        views: data.views || 0,
        downloads: data.downloads || 0,
        comments: data.comments || 0,
        description: data.description || '',
        images: (data.images || []).map(img => ({ src: (img.mq && img.mq.src) || (img.orig && img.orig.src) || '' })).filter(img => img.src !== ''),
        isMarketSuitable: data.isMarketSuitable || false,
        created: data.created || null
      };
    }
  } catch (err) {
    logActivity(`Error fetching WT Live API metadata for lang_group ${lang_group}: ${err.message}`, 'ERROR');
  }
  return null;
}

module.exports = {
  fetchPostMetadata
};
