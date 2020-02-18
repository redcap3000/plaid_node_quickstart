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
var ACCESS_TOKEN = null;
var PUBLIC_TOKEN = null;
var ITEM_ID = null;
// The payment_token is only relevant for the UK Payment Initiation product.
// We store the payment_token in memory - in production, store it in a secure
// persistent data store
var PAYMENT_TOKEN = null;
var PAYMENT_ID = null;

// Initialize the Plaid client
// Find your API keys in the Dashboard (https://dashboard.plaid.com/account/keys)
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
    ITEM_ID: ITEM_ID,
    ACCESS_TOKEN: ACCESS_TOKEN,
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
    ACCESS_TOKEN = tokenResponse.access_token;
    ITEM_ID = tokenResponse.item_id;
    prettyPrintResponse(tokenResponse);
    response.json({
      access_token: ACCESS_TOKEN,
      item_id: ITEM_ID,
      error: null,
    });
  });
});


// Retrieve Transactions for an Item
// https://plaid.com/docs/#transactions
app.get('/transactions', function(request, response, next) {
  // Pull transactions for the Item for the last 30 days
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
    client.getTransactions(ACCESS_TOKEN, startDate, endDate, {
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
          //console.log(t)
          //console.log('************')
          //console.log(r)
          return r
         
        })
        //console.log(filtered)
        //prettyPrintResponse(transactionsResponse);
        response.json({error: null, transactions: {transactions: filtered}});
      }
    });
  }else{
    prettyPrintResponse({error: 'poorly formed date ' ,startDate : startDate,endDate:endDate });
    response.json({error: 'poorly formed date ' ,startDate : startDate,endDate:endDate });
  }

});

// Retrieve Identity for an Item
// https://plaid.com/docs/#identity
app.get('/identity', function(request, response, next) {
  client.getIdentity(ACCESS_TOKEN, function(error, identityResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(identityResponse);
    response.json({error: null, identity: identityResponse});
  });
});

// Retrieve real-time Balances for each of an Item's accounts
// https://plaid.com/docs/#balance
app.get('/balance', function(request, response, next) {
  client.getBalance(ACCESS_TOKEN, function(error, balanceResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(balanceResponse);
    response.json({error: null, balance: balanceResponse});
  });
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


// Retrieve an Item's accounts
// https://plaid.com/docs/#accounts
app.get('/accounts', function(request, response, next) {
  client.getAccounts(ACCESS_TOKEN, function(error, accountsResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(accountsResponse);
    response.json({error: null, accounts: accountsResponse});
  });
});

// Retrieve ACH or ETF Auth data for an Item's accounts
// https://plaid.com/docs/#auth
app.get('/auth', function(request, response, next) {
  client.getAuth(ACCESS_TOKEN, function(error, authResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(authResponse);
    response.json({error: null, auth: authResponse});
  });
});

// Retrieve Holdings for an Item
// https://plaid.com/docs/#investments
app.get('/holdings', function(request, response, next) {
  client.getHoldings(ACCESS_TOKEN, function(error, holdingsResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error,
      });
    }
    prettyPrintResponse(holdingsResponse);
    response.json({error: null, holdings: holdingsResponse});
  });
});

// Retrieve information about an Item
// https://plaid.com/docs/#retrieve-item
app.get('/item', function(request, response, next) {
  // Pull the Item - this includes information about available products,
  // billed products, webhook information, and more.
  client.getItem(ACCESS_TOKEN, function(error, itemResponse) {
    if (error != null) {
      prettyPrintResponse(error);
      return response.json({
        error: error
      });
    }
    // Also pull information about the institution
    client.getInstitutionById(itemResponse.item.institution_id, function(err, instRes) {
      if (err != null) {
        var msg = 'Unable to pull institution information from the Plaid API.';
        console.log(msg + '\n' + JSON.stringify(error));
        return response.json({
          error: msg
        });
      } else {
        prettyPrintResponse(itemResponse);
        response.json({
          item: itemResponse.item,
          institution: instRes.institution,
        });
      }
    });
  });
});

var server = app.listen(APP_PORT, function() {
  console.log('plaid-quickstart server listening on port ' + APP_PORT);
});

var prettyPrintResponse = response => {
  console.log(util.inspect(response, {colors: true, depth: 4}));
};

// This is a helper function to poll for the completion of an Asset Report and
// then send it in the response to the client. Alternatively, you can provide a
// webhook in the `options` object in your `/asset_report/create` request to be
// notified when the Asset Report is finished being generated.

app.post('/set_access_token', function(request, response, next) {
  ACCESS_TOKEN = request.body.access_token;
  client.getItem(ACCESS_TOKEN, function(error, itemResponse) {
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