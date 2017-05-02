const micro = require('micro')
const rateLimit = require('micro-rateLimit')
const url = require('url');
const querystring = require('querystring');
const StreamSnitch = require('stream-snitch')
const fetch = require('node-fetch')

const RESULTS_LIMIT = 3

const makeParams = (searchTerms, callback) => {
  return {
    'format': 'json',
    'apikey': 'b84b9332bbdc10da8d10d4f60bec25fe',
    'q_lyrics': searchTerms,
    'f_artist-id': 33091467, // limit to Kanye West?
    'f_music_genre_id': 18,
    'f_lyrics_language': 'en',
    'f_has_lyrics': true,
    's_artist_rating': 'desc',
    's_track_rating': 'desc',
    'quorum_factor': 0.9, // match pretty close
    'page_size': RESULTS_LIMIT,
  }
}

const makeSongIdList = (trackList, list) => {
  console.log(`track list: `, trackList)
  trackList.map(track => {
    console.log(`track id: `, track.track_id) // why doesn;t this work??
    list.push(track.track_id)
  })
  return list
}


// API request
const findSongIds = async (searchTerms) => {
  const params = makeParams(searchTerms, 'callback');
  const stringifiedParams = querystring.stringify(params)
  const url = `https://api.musixmatch.com/ws/1.1/track.search?${stringifiedParams}`
  const response = await fetch(url)
  const json = await response.json()
  const trackListJson = await json.message.body.track_list
  console.log(`track list json: `, trackListJson)
  return makeSongIdList(trackListJson, [])
}

// API request
const getLyrics = async (trackId) => {
    const url = `https://api.musixmatch.com/ws/1.1/track.lyrics.get?format=jsonp&callback=callback&track_id=${trackId}&apikey=b84b9332bbdc10da8d10d4f60bec25fe`
  const response = await fetch(url)
  const json = await micro.json(response)
  console.log(`Get lyrics: `, {json})
  return json.message.body.lyrics.lyrics_body
}

const phraseMatches = (searchTerms, lyrics) => {
  let phraseMatches = []
  // format the matching regex
  let termsRegexFilter
  const termsToRegex = (str) => str.split(",").join('|')
  if (searchTerms.length > 1) {
    termsRegexFilter = termsToRegex(searchTerms)
    console.log({termsRegexFilter})
  } else {
    termsRegexFilter = searchTerms
  }
  const regex = `/^.*\b(${termsRegexFilter})\b.*$/igm`
  // stream
  const snitch = new StreamSnitch(regex)
  snitch.on('match', (match) => phraseMatches.push(match[1]))
  lyrics.pipe(snitch)
  return phraseMatches
}

module.exports = rateLimit({window: 1000, limit: 5}, async (req, res) => {
  const {method} = req
  if (method === 'OPTIONS') {
    return {}
  }
  if (method === 'GET') {
    const queryData = url.parse(req.url, true).query
    const searchTerms = queryData.terms

    if (searchTerms) {
      console.log({searchTerms})
      let allPhraseMatches = [];
      // search for songs that contain our terms in their lyrics
      const songMatches = await findSongIds(searchTerms)
      // for each songMatch, get lyrics,
      // then pipe lyrics thru stream search
      // then add them to array
      console.log({songMatches})
      songMatches.map((trackId, searchTerms) => {
        const lyrics = getLyrics(trackId)
        console.log({lyrics})
        const matches = phraseMatches(searchTerms, lyrics)
        matches.map(phrase => allPhraseMatches.push(phrase))
      })

      if (allPhraseMatches.length > 0) {
        micro.send(res, 200, {data: {phrases: allPhraseMatches, terms: searchTerms}})
      }
      else {
        micro.send(res, 200, {message: 'No results'})
      }

    } else {
      micro.send(res, 200, {message: 'No search terms provided'})
    }
  }
  else {
    micro.send(res, 405, {error: 'Method not allowed'})
  }
});
