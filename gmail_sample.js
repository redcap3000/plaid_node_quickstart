const fs = require('fs');
const {parse} = require('node-html-parser')
const readline = require('readline');
const {google} = require('googleapis');
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
/*
  collection (fetch records from google gmail api)

  presort (group transactions by type : deposit/purchase/etc.)

  process (read html for transaction amount/details)

  confirm (double check entities)

  resolve (print out object/ update collection)

*/
// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  var auth = JSON.parse(content)
  //authorize(auth, listLabels);
  
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
function getTermBetween(blob,t1,t2){
  var x = blob.split(t1)
  if(x.length > 1){
    var y = x.pop().split(t2)
    if(y.length > 1){
      return y[0]
    }
  }
  return false
}

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

function base64Buffer(data,removeSpace){
  var buff = new Buffer(data, 'base64');
  var text = buff.toString('ascii');
  const parsed = parse(text)
  var btcSelector = 'body'
  var htmlBody = parsed.querySelector('body');
  if(typeof parsed != 'undefined' && parsed){
    if(typeof removeSpace != 'undefined' && removeSpace){
      var line2 = parsed.rawText.replace(/\s/g, "")
      if(line2){
        return line2
      }
    }else{
      // raw response
      return parsed
    }
  }   
  return false
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
    for(var k in r.data){
      if(fieldFilter.indexOf(k) > -1){
        d[k]=r.data[k]
      }
    }
    var payloadFilter = [
      'Subject',
      'Date'
    ]
    
    var cashCardPreTerms = {
      'buy' : 'You purchased',
      'sell' : 'You sold',
      'spend' : 'You spent',
      'withdrawal' : 'Your withdrawal of ',
    }

    var cashCardPostTerms = {
      'deposit' : 'Your deposit has been received',
      'depositAvailable' : 'deposit completed',
      'boostApplied' : 'instantly applied',
      'paymentDecline' : 'was declined'

    }

    // <term> sent you $200
    var cashCardMidTerms = {
      'recieved' : 'sent you',
    }
    var line = ''

    var messageLineObj = {}

    d.payload.headers.filter(function(p){
      var key = p.name
      if(payloadFilter.indexOf(key) > -1){
        if(key == 'Date'){
          messageLineObj.date = p.value
        }else{
          line +=p.value +' '
        }       
      }else{
        //console.log(key + ' ' + p.value)
      }
    })
    var match = []
    for(var action in cashCardPreTerms){
      var term = cashCardPreTerms[action]
      var term2 = ''
      var term3 = []
      //console.log(term)
      match = line.split(term)
      //console.log(match)
      if(match.length > 1){
        //console.log('ACTION\t'+action)
        messageLineObj.raw = line
        if(action == 'spend'){
          term2 = line.split(cashCardPostTerms['boostApplied'])
          // cant use getTermBetween since there are multiple '.' 
          // has boost? then split on period to extract
          
        
          term3 = line.split(' at ')
          //console.log('\n\n\t'+term3)
          messageLineObj.amount =  term3[0].split('$')[1]
          var term4 = term3[1].split('. Your ')
          messageLineObj.where = term4[0]
          if(term2.length == 2){
            // get 'where money was spent... '
            messageLineObj.boost = term4[1].split(' ')[0]
          }else{
            //console.log('Pre\t'+action + '\t' + match[1])
          }
          
        }else if(action == 'buy' || action == 'sell'){
          messageLineObj.action = action
          messageLineObj.where = match[1].trim()
          if(typeof d.snippet != 'undefined'){
            term2 = d.snippet.replace(/\s/g, "")
          }else{
            d.payload.parts.filter(function(prt){
              if(typeof prt.body.data != 'undefined' && prt.body.data){
                var parsed = base64Buffer(prt.body.data,true)

                if(typeof parsed != 'undefined' && parsed){
                  term2+= parsed
                }      
              }
            })
          }
          // hard coded :/ but i dont have any other transactions (such as stocks) to draw an example from. 
          // could attempt to seperate term2 by capital letters may work... or regex of course :/

          var btcPurchaseMap = {
            'btcAmount'       : ['BTC'  , 'BitcoinPurchase'],
            'btcUsdValue'     : ['BTC$' , 'CompletedPurchased'],
            'btcExchangeRate' : ['BTCExchangeRate$','Fee$'],
            'squareFee'       : ['Fee$','Total'],
            'totalUsdAmt'     : ['Total$','B)SquareInc.']
          }
          if(action == 'sell'){
            // modify the terms slightly when selling
            btcPurchaseMap.amount = ['BitcoinSale','BTC$']
            btcPurchaseMap.btcUsdValue[1] = 'CompletedSold'
          }
          for(var k in btcPurchaseMap){
            var param = btcPurchaseMap[k]
            var t = getTermBetween(term2,param[0],param[1])
            if(t){
              messageLineObj[k] = ''
              messageLineObj[k] = parseFloat(t)
            } 
          }
  
        }

      }else if (action == 'deposit'){
        //console.log('DEPOSIT')
        //console.log(match)
      }
    }
    if(typeof messageLineObj.boost == 'undefined'){
      /* boosts can only be applied to outgoing transactions... below
       * are for deposits and bank transactions
       *
       * after parsing the message body, removing whitespace, it contracts everything
       * so have to look for specific terms to do stuff
       * so find the first string (usually the beginning) then find the second string, and the value between the two is what we're lookin for
      */
      var parsedSearchTerms = {

        'BitcoinDeposit' : 'BTCDeposited',
        // some emails have weird wording
        'BTCDepositedThe' : 'BTCdeposit'
        // 
        //'BitcoinDeposit' : 'BTCPending'
      }
      for(var action in cashCardPostTerms){
        var term = cashCardPostTerms[action]
        var amount = false
        match = line.split(term)
        if(match.length > 1){
          // probably doesnt 'matter' to check the 'received' because sometimes it wont parse the amount properly..
          if(line.trim() === 'Your Bitcoin deposit completed' || line.trim() === 'Your Bitcoin deposit has been received' ){
            messageLineObj.where = 'Bitcoin'
            //console.log(d.snippet)
            // dont need this if d.snippet is present... but good example
            // refactor and normalize everything using maps
            d.payload.parts.filter(function(prt){
              if(typeof prt.body.data != 'undefined' && prt.body.data){
                /* decode base64, encode raw html, parse html body, implode whitespace, use split to match terms
                 * take inner and apply to 'amount' field if possible
                 */
                var parsed = base64Buffer(prt.body.data,true)
                if(typeof parsed != 'undefined' && parsed){
                  // THE MAGIC HAPPENS HERE
            
                  for(var sTerm in parsedSearchTerms){
                    //console.log(line2)
                    amount = getTermBetween(parsed,sTerm,parsedSearchTerms[sTerm]) 
                    if(amount){
                        messageLineObj.amount = amount
                        messageLineObj.action = sTerm
                    }
                  }
                  if(!amount){
                    var amount = getTermBetween(parsed,sTerm,'BTCPending')
                    if(amount){
                      messageLineObj.action = 'Pending BTC Deposit'
                      messageLineObj.amount = amount
                      messageLineObj.where = 'Square'
                    }else{
                      // check for 'BitcoinDeposit<number>BTCDepositedThe<number>BTCdeposit'
                    }
                  }      
                }else{
                  // check for term 'pending'
                  
                }          
              }
            })
          }else{
            /* checks for declined payment
             *
             */
            match = line.split('was declined')
            if(match.length > 1){
              // figure out amount
              var amt = getTermBetween(match[0],'$','payment')
              if(amt){
                messageLineObj.amount = parseFloat(amt)
              }
              var at = match[0].split(' at ')
              //console.log(at)
              if(at.length > 1){
                messageLineObj.where = at[1].trim()
              }
            }else{
              // look for 'was declined?'
              console.log("something else happened")
              console.log(line)
              console.log(match)
            }
          }
          if(typeof messageLineObj.action == 'undefined'){
            messageLineObj.action = action
          }
          //console.log('Post\t'+action + '\t' + match[1])
        }else{
          match = line
        }
      }
      if(typeof messageLineObj.where == 'undefined'){
        // check for 'sent you'
        //console.log('****' + line + '\n\n')   
        // re do.. :/
        //console.log(match)
        //console.log(messageLineObj)

      }

    }
    console.log(messageLineObj)
    //if(match.length === 1){
    /*
    
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

