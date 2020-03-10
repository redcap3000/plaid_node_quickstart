const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  var auth = JSON.parse(content)
  authorize(auth, listLabels);
  
  cb = function(e,r){
    console.log(e)
    console.log(r)
  }
  console.log(typeof cb)
  authorize(auth, listMessages)
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listLabels(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  gmail.users.labels.list({
    userId: 'me',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const labels = res.data.labels;
    if (labels.length) {
      console.log('Labels:');
      labels.forEach((label) => {
        console.log(`- ${label.name}`);
      });
    } else {
      console.log('No labels found.');
    }
  });
}

/*
function getMessages(auth) {
  const gmail = google.gmail({version: 'v1', auth});
  gmail.users.messages.list({
    userId: 'me',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const labels = res.data.labels;
    if (labels.length) {
      console.log('Labels:');
      labels.forEach((label) => {
        console.log(`- ${label.name}`);
      });
    } else {
      console.log('No labels found.');
    }
  });
}

*/

function listMessages(auth) {
  // maxResults
  // pageToken
  // q (query) "from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread"
  query = "from:cash@square.com"
        
  const userId = 'me'
  const gmail = google.gmail({version: 'v1', auth});

  function getMessage(userId, messageId, callback) {
    var r = gmail.users.messages.get({
      'userId': userId,
      'id': messageId
    });
    r.then(callback);
  }


  function msgHandler(r,e){
    const fieldFilter = [
      'id',
      'threadId',
      'labelIds',
      'snippet',
      'historyId',
      'internalDate',
      'payload'
    ]
    var d = {}
    //console.log(r.body)
    for(var k in r.data){
      if(fieldFilter.indexOf(k) > -1){
        d[k]=r.data[k]
      }
    }
   // console.log(typeof d.payload)
    var payloadFilter = [
      'Subject',
    //  'Date',

    ]
    
    var cashCardPreTerms = {


      'buy' : 'You purchased',
      'sell' : 'You sold',
      'spend' : 'You spent'


    }

    var cashCardPostTerms = {
      'deposit' : 'depost has been recieved',
      'depositAvailable' : 'deposit completed',
      'boostApplied' : 'instantly applied',
      'paymentDecline' : 'was declined'

    }

    // <term> sent you $200
    var cashCardMidTerms = {
      'recieved' : 'sent you',

    }
    var line = ''
    d.payload.headers.filter(function(p){
      var key = p.name
      if(payloadFilter.indexOf(key) > -1){
        //console.log(p.value) 
        line +=p.value +' '       
      }
    })
    //console.log(line)
    var match = []
    for(var action in cashCardPreTerms){
      var term = cashCardPreTerms[action]
      var term2 = ''
      var term3 = []
      match = line.split(term)
      if(match.length > 1){
        if(action == 'spend'){
          console.log(line)

          term2 = line.split(cashCardPostTerms['boostApplied'])
          // has boost? then split on period to extract
          term3 = line.split(' at ')
          var amount = term3[0].split('$')[1]

          var term4 = term3[1].split('. Your ')

          var where = term4[0]

          if(term2.length == 2){
            // get 'where money was spent... '
            var boostAmount = term4[1].split(' ')[0]
            console.log(action + '\t' + amount + '\t' + where + '\t***' + boostAmount)
            
          }else{
            console.log(action + '\t' + amount + '\t' + where )
            //console.log('Pre\t'+action + '\t' + match[1])
          
          }
        }else{

        }
      }
    }
    //if(match.length === 1){
    /*
    for(var action in cashCardPostTerms){
      var term = cashCardPostTerms[action]
      match = line.split(term)
      if(match.length > 1){
        console.log('Post\t'+action + '\t' + match[1])
      }
    }
    */ 
    //}
    // have to get attachment parts
    /*
    {


      id : <string>,
      threadId: <string>,
      labelIds : <array>,
      snippet : <blob>,
      historyId : <string/int>,
      internalDate : <string/int - unix timestamp>


    }*/

  }
  var getPageOfMessages = function(r, result) {
    r.then(function(resp) {
      result = result.concat(resp.data.messages);
      var nextPageToken = resp.nextPageToken;
      if (typeof nextPageToken != 'undefined' && nextPageToken) {
        console.log("getting next page")
        request = gmail.users.messages.list({
          'userId': userId,
          'pageToken': nextPageToken,
          'q': query
        });
        getPageOfMessages(r, result);
      } else {
        console.log('dataset complete?')
        // begin getting messages
        console.log(result)
        result.filter(function(m){
          getMessage(userId,m.id,msgHandler)
        })
        return result
      }
    });
  };
  var initialRequest = gmail.users.messages.list({
    'userId': userId,
    'q': query
  });
  getPageOfMessages(initialRequest, []);
}

