'use strict';

/* specifically for coinbase-pro */
var util = require('util');
var envvar = require('envvar');
/* 
  create coinbase.json with api connection credentials 
  store in root
  
  ** gets wallet balances
    cbpro.wallets()
  ** gets current orders
    cbpro.orders()
  ** cancel order
    cbpro.cbCancelOrder(orderId<string>?)
  ** deposit USD to BANK (only works for USD, not USDT,USDC.)
    cbpro.depositUSD(amount<float>)
  ** sell crypto
    cbpro.sell({
      product_id : <string>,
      price : <float>,
      amount : <float>
    })
  ** buy crypto (did some float to string conversion in placeOrder for whatever reason...)
    cbpro.buy({
      product_id : <string>,
      price : <float>,
      amount : <float>
    })
  ** cbLoopFunction - checks orders/wallets on an interval, in ideal implementation also handles
      basic automated trade matching. Call using setTimeout externally or as needed to refresh internal variables
      coinbase.json
  {
    "cbproKey":"YOUR KEY",
    "cbproSecret":"YOUR SECRET",
    "cbproPass":"YOUR PASS"
  }

*/
var cbpro = require('./coinbase.js')

var express = require('express');
var bodyParser = require('body-parser');
var moment = require('moment');
var plaid = require('plaid');

var APP_PORT = envvar.number('APP_PORT', 8000);
var PLAID_CLIENT_ID = envvar.string('PLAID_CLIENT_ID');
var PLAID_SECRET = envvar.string('PLAID_SECRET');
var PLAID_PUBLIC_KEY = envvar.string('PLAID_PUBLIC_KEY');
var PLAID_ENV = envvar.string('PLAID_ENV', 'sandbox');
// PLAID_PRODUCTS is a comma-separated list of products to use when initializing
// Link. Note that this list must contain 'assets' in order for the app to be
// able to create and retrieve asset reports.
var PLAID_PRODUCTS = envvar.string('PLAID_PRODUCTS', 'transactions');

// PLAID_PRODUCTS is a comma-separated list of countries for which users
// will be able to select institutions from.
var PLAID_COUNTRY_CODES = envvar.string('PLAID_COUNTRY_CODES', 'US,CA');

// Parameters used for the OAuth redirect Link flow.
//
// Set PLAID_OAUTH_REDIRECT_URI to 'http://localhost:8000/oauth-response.html'
// The OAuth redirect flow requires an endpoint on the developer's website
// that the bank website should redirect to. You will need to whitelist
// this redirect URI for your client ID through the Plaid developer dashboard
// at https://dashboard.plaid.com/team/api.
var PLAID_OAUTH_REDIRECT_URI = envvar.string('PLAID_OAUTH_REDIRECT_URI', '');
// Set PLAID_OAUTH_NONCE to a unique identifier such as a UUID for each Link
// session. The nonce will be used to re-open Link upon completion of the OAuth
// redirect. The nonce must be at least 16 characters long.
var PLAID_OAUTH_NONCE = envvar.string('PLAID_OAUTH_NONCE', '');

// We store the access_token in memory - in production, store it in a secure
// persistent data store
//var ACCESS_TOKEN = null;
var PUBLIC_TOKEN = null;
var ITEM_ID = null;


var client = new plaid.Client(
  PLAID_CLIENT_ID,
  PLAID_SECRET,
  PLAID_PUBLIC_KEY,
  plaid.environments[PLAID_ENV],
  {version: '2019-05-29', clientApp: 'Plaid Quickstart'}
);

var app = express();
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());

// init cb data
cbpro.cbLoopFunction()
// every 15 seconds probably let user define interval
setInterval(function(){
  cbpro.cbLoopFunction()
},15000)

app.get('/cbpro-wallets',function(request, response, next){
  if(typeof cbpro != 'undefined' && typeof cbpro.wallets == 'function'){
   // could filter out id here for 'security' rematch against server, detect change in id
   response.json({error: null, wallets: cbpro.wallets()});
  }
})
app.get('/', function(request, response, next) {

  if(typeof request.query.startDate != 'undefined')
  {
      console.log(request.query.startDate)
      console.log(request.query.endDate)

    // check startDate to ensure its not two years before the current date 
    // which is the api limit
    // 'YYYY-MM-DD'
    var startDate = moment(request.query.startDate).format('YYYY-MM-DD');
  }else{
    var startDate = moment().subtract(30, 'days').format('YYYY-MM-DD');

  }
  if(typeof request.query.endDate != 'undefined'){
    // end date cannot be greater than today and must be greater than start date
  }else{
    // month to end
    var endDate = moment().format('YYYY-MM-DD');
  }

  response.render('index.ejs', {
    PLAID_PUBLIC_KEY: PLAID_PUBLIC_KEY,
    PLAID_ENV: PLAID_ENV,
    PLAID_PRODUCTS: PLAID_PRODUCTS,
    PLAID_COUNTRY_CODES: PLAID_COUNTRY_CODES,
    PLAID_OAUTH_REDIRECT_URI: PLAID_OAUTH_REDIRECT_URI,
    PLAID_OAUTH_NONCE: PLAID_OAUTH_NONCE,
    //ITEM_ID: ITEM_ID,
    //ACCESS_TOKEN: ACCESS_TOKEN,
  });
});

// This is an endpoint defined for the OAuth flow to redirect to.
app.get('/oauth-response.html', function(request, response, next) {
  response.render('oauth-response.ejs', {
    PLAID_PUBLIC_KEY: PLAID_PUBLIC_KEY,
    PLAID_ENV: PLAID_ENV,
    PLAID_PRODUCTS: PLAID_PRODUCTS,
    PLAID_COUNTRY_CODES: PLAID_COUNTRY_CODES,
    PLAID_OAUTH_NONCE: PLAID_OAUTH_NONCE,
  });
});

// Exchange token flow - exchange a Link public_token for
// an API access_token
// https://plaid.com/docs/#exchange-token-flow
app.post('/get_access_token', function(request, response, next) {
  PUBLIC_TOKEN = request.body.public_token;
  client.exchangePublicToken(PUBLIC_TOKEN, function(error, tokenResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(tokenResponse);
    response.json({
      access_token: tokenResponse.access_token,
      item_id: tokenResponse.item_id,
      error: null,
    });
  });
});


// Retrieve Transactions for an Item
// https://plaid.com/docs/#transactions
// pass access token via client :/

app.get('/transactions', function(request, response, next) {
  // Pull transactions for the Item for the last 30 days
  if(typeof request.query.access_token == 'undefined'){
    prettyPrintResponse({error:'access_token not provided'});
  }
  if(typeof request.query.startDate != 'undefined')
  {
     
    // check startDate to ensure its not two years before the current date 
    // which is the api limit
    // 'YYYY-MM-DD'
    var startDate =request.query.startDate;
  }else{
    var startDate = moment().subtract(30, 'days').format('YYYY-MM-DD');

  }
  if(typeof request.query.endDate != 'undefined'){
    var endDate = request.query.endDate;
    // end date cannot be greater than today and must be greater than start date
  }else{
    // month to end
    var endDate = moment().format('YYYY-MM-DD');

  }
  if(typeof startDate != 'undefined' && startDate && typeof endDate != 'undefined' && endDate){
    // should be ok when retrieving access by year, but ideally should retrieve access
    // per month for 'large' datasets otherwise implement promise to populate until end
    client.getTransactions(request.query.access_token, startDate, endDate, {
      count: 500,
      offset: 0,
    }, function(error, transactionsResponse) {
      if (error != null) {
        prettyPrintResponse(error);
        return response.json({
          error: error
        });
      } else {
        //var responseRows = []
        var nullChk = function(n){
         return (n == null ||  
                n == undefined || 
                n.length == 0 ? true : false)
          
        }
        var filtered = transactionsResponse.transactions.map(function(t){
          var r= {}

          for(var field in t){
            var val = t[field]
            // catch flat fields or arrays
            if(((typeof val == 'number' || typeof val == 'string') && !nullChk(val))){
              r[field] = undefined
              r[field] = val
            }else if(val != {} && val && val.length > 0){
              // catch array, here because if val null cannot read prop length of null
              r[field] = undefined
              r[field] = val
            }else if(typeof val == 'object'){
              if(val == {}){
                return false
              }
              var iR = {}
              // catch objects
              // only two levels here so recursion is kinda .. meh
              for(var iField in val){
                var iVal = val[iField]
                if(!nullChk(iVal)){
                  iR[iField] = undefined
                  iR[iField] = iVal
                }
              }
              if(iR != {}){
                r[field] = undefined
                r[field] = iR
              }
            }
          }
          return r
        })
        //prettyPrintResponse(transactionsResponse);
        response.json({error: null, transactions: {transactions: filtered}});
      }
    });
  }else{
    prettyPrintResponse({error: 'poorly formed date ' ,startDate : startDate,endDate:endDate });
    response.json({error: 'poorly formed date ' ,startDate : startDate,endDate:endDate });
  }

});



app.get('/refreshToken', function(request, response, next) {
  client.invalidateAccessToken(request.query.access_token, function(error, re) {
    if (error != null) {
      prettyPrintResponse(error);
      // to do - forward client to new access token
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(re);
    response.json({error: null, access_token: re});
  });
});



var server = app.listen(APP_PORT, function() {
  console.log('plaid-quickstart server listening on port ' + APP_PORT);
});

var prettyPrintResponse = response => {
  console.log(util.inspect(response, {colors: true, depth: 4}));
};

app.post('/set_access_token', function(request, response, next) {
  client.getItem(request.body.access_token, function(error, itemResponse) {
    if (error != null) {
      return response.json({
        error: error,
      });
    }else if(typeof itemResponse != 'undefined' && typeof itemResponse.item != 'undefined' && typeof itemResponse.item.item_id != 'undefined'){
      response.json({
        item_id: itemResponse.item.item_id,
        error: false,
      });
    }
  });
});