'use strict';
const { cleanTitle, slugify } = require('./common');
const slugOf = (x) => slugify(x || '');

// Channels that publish for many artists: never treat their name as the artist.
const LABEL_RE = /(t-?series|zee music|speed records|tips official|saregama|sony music|universal music|warner|aditya music|lahari|eros now|yrf|hybe|big ?hit|jyp|sm ?town|yg ?entertainment|starship|1thek|stone music|genie music|mnet|kbs|sbs|mbc|colors|desi music|white hill|geet mp3|t-series|venus|shemaroo|wave music|jass records|times music|dmc|worldstar|lyrical lemonade|genius|records$|entertainment$|labels$)/i;

/** Prefer the channel's casing ("DRAKE" -> "Drake"); drop duplicate CJK names ("aespa 에스파" -> "aespa"). */
function canonical(a, chan) {
  if (chan && a.toLowerCase() === chan.toLowerCase()) return chan;
  if (/[A-Za-z]/.test(a) && /[\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(a)) {
    const latin = a.split(/\s+/).filter((w) => !/[\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(w)).join(' ').trim();
    if (latin) return latin;
  }
  return a;
}

function parseArtistAndTitle(rawTitle, channel) {
  const topic = channel.match(/^(.*) - Topic$/);
  const chan = (topic ? topic[1] : channel).replace(/VEVO$/i, '').replace(/\s*Official\s*$/i, '').trim();
  const isLabel = !topic && LABEL_RE.test(channel);

  // "Song | Singer | Label" (common for Indian labels)
  const pipe = rawTitle.match(/^([^|]+?)\s*\|\s*([^|]+?)(?:\s*\||$)/);
  // "Artist - Song (Official Video)"
  let dash = rawTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  // "ARTIST / Song" (common in Japan) when the left side is the channel's artist.
  const slash = rawTitle.match(/^(.+?)\s+\/\s+(.+)$/);
  if (slash && (!dash || dash[1].includes(' / ')) && slugOf(slash[1]) && slugOf(chan).startsWith(slugOf(slash[1]))) dash = slash;
  if (dash && !topic) {
    let [, a, s] = dash;
    a = a.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim();
    // "Song - Artist" (common in Brazil/LatAm): swap when only the right side names the channel.
    const cs = slugOf(chan);
    const right = cleanTitle(s).replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim();
    if (cs.length > 2 && slugOf(right).includes(cs) && !slugOf(a).includes(cs) && right.length < 70) {
      return { artist: canonical(right, chan), title: cleanTitle(a) };
    }
    if (a.length > 0 && a.length < 70) return { artist: canonical(a, chan), title: cleanTitle(s) };
  }
  if (pipe && !topic && isLabel) {
    const a = pipe[2].replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim();
    if (a && a.length < 60) return { artist: canonical(a, chan), title: cleanTitle(pipe[1]) };
  }
  // K-pop style: ARTIST 'Song' M/V
  const quoted = rawTitle.match(/^(.+?)\s*[‘'"“「『]([^’'"”」』]+)[’'"”」』]/);
  if (quoted && !topic) {
    const a = quoted[1].replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (a && a.length < 60) return { artist: canonical(a, chan), title: cleanTitle(quoted[2]) };
  }
  // CamelCase VEVO names: "TaylorSwiftVEVO" -> "Taylor Swift"
  let artist = chan;
  if (/VEVO$/i.test(channel) && !/\s/.test(artist)) artist = artist.replace(/([a-z])([A-Z])/g, '$1 $2');
  return { artist, title: cleanTitle(rawTitle), label: isLabel };
}

module.exports = { parseArtistAndTitle, LABEL_RE };
