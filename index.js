const micro = require('micro')
const rateLimit = require('micro-rateLimit')
const url = require('url');
const querystring = require('querystring');
const StreamSnitch = require('stream-snitch')
const fetch = require('node-fetch')

const RESULTS_LIMIT = 5

const makeParams = (searchTerms, callback) => {
  return {
    'format': 'jsonp',
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
    'callback': 'callback'
  }
}

const makeSongIdList = (trackList, list) => {
  trackList.map((track) => list.push(track_id))
  return list
}

// API request
const searchForSongs = (searchTerms) => {
  const params = makeParams(searchTerms, 'callback');
  const stringifiedParams = querystring.stringify(params)
  console.log({stringifiedParams})
  const url = `https://api.musixmatch.com/ws/1.1/track.search?${stringifiedParams}`
  const response = fetch(url)
    .then(function(response) {
      console.log(response.json())
      return response.json()}
    )
    .then(json => makeSongIdList(json.message.body.track_list, []))
}

// API request
const getLyricMatches = (trackId, searchTerms) => {
  let phraseMatches = []

  const termsToArray = (searchTerms) => str.split(",").map((term)=> term.trim())
  const termsRegexFilter = termsToArray.join('|')
  const regex = `/^.*\b(${termsRegexFilter})\b.*$/igm`
  const url = `https://api.musixmatch.com/ws/1.1/track.lyrics.get?format=jsonp&callback=callback&track_id=${trackId}&apikey=b84b9332bbdc10da8d10d4f60bec25fe`
  const response = fetchJsonp(url)
  const json = micro.json(response)
  const lyrics = json.message.body.lyrics.lyrics_body

  const snitch = new StreamSnitch(regex)
  snitch.on('match', (match) => phraseMatches.push(match[1]))
  lyrics.pipe(snitch)

  return phraseMatches
}

module.exports = rateLimit({window: 1000, limit: 1}, async (req, res) => {
  const {method} = req
  if (method === 'OPTIONS') {
    return {}
  }
  if (method === 'GET') {
    const queryData = url.parse(req.url, true).query
    const searchTerms = queryData.terms
    console.log(`search terms: ${searchTerms}`)

    if (searchTerms) {
      let allPhraseMatches = [];
      // search for songs that contain our terms in their lyrics
      const songMatches = await searchForSongs(searchTerms)
      // for each songMatch run a lyric search for our terms and push all results to array
      await songMatches.map((trackId, searchTerms) => {
        let matches = getLyricMatches(trackId, searchTerms)
        matches.map(phrase => allPhraseMatches.push(phrase))
      })

      micro.send(res, 200, {data: {phrases: allPhraseMatches}})
    } else {
      micro.send(res, 200, {message: 'No search terms provided'})
    }
  }
  else {
    micro.send(res, 405, {error: 'Method not allowed'})
  }
});
