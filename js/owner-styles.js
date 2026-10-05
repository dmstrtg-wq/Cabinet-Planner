// My Cabinet Planner — js/owner-styles.js
// The real supplier finish catalog, shown only to OWNER_USER_IDS accounts (see getStyles in
// core.js and companyFinishes in priceimport.js). Kept in its own file so both app.html and
// profile.html can use it. Brand rule: these names must never be shown to other accounts.
// Loaded as a classic script before core.js (app.html) and priceimport.js (profile.html).
const STYLES = [
  {tier:'Gold',     code:'AW', name:'Ice White Shaker',      swatch:'#F2F1EE'},
  {tier:'Gold',     code:'AP', name:'Pepper Shaker',          swatch:'#2B2926'},
  {tier:'Gold',     code:'PW', name:'Petit White',            swatch:'#FAF9F7'},
  {tier:'Gold',     code:'PR', name:'Petit Brown',            swatch:'#8C6634'},
  {tier:'Gold',     code:'PS', name:'Petit Sand',             swatch:'#D3C4A0'},
  {tier:'Gold',     code:'PD', name:'Petit Blue',             swatch:'#1B3A5C'},
  {tier:'Platinum', code:'AB', name:'Lait Grey Shaker',       swatch:'#B9BDC6'},
  {tier:'Platinum', code:'AR', name:'Woodland Brown',         swatch:'#6A4B2A'},
  {tier:'Platinum', code:'GW', name:'Gramercy White',         swatch:'#EFECE7'},
  {tier:'Platinum', code:'TW', name:'Uptown White',           swatch:'#FEFEFE'},
  {tier:'Platinum', code:'SL', name:'Signature Pearl',        swatch:'#ECE7DA'},
  {tier:'Platinum', code:'TS', name:'Townsquare Grey',        swatch:'#697080'},
  {tier:'Platinum', code:'AG', name:'Greystone Shaker',       swatch:'#4B4F5C'},
  {tier:'Platinum', code:'AX', name:'Xterra Blue Shaker',     swatch:'#5C8DB9'},
  {tier:'Platinum', code:'PH', name:'Petit Oak',              swatch:'#C9A96D'},
  {tier:'Platinum', code:'AZ', name:'Champagne Shaker',       swatch:'#E7DFD0'},
  {tier:'Titanium', code:'AN', name:'Nova Light Grey Shaker', swatch:'#C6C9CD'},
  {tier:'Titanium', code:'TQ', name:'Townplace Crema',        swatch:'#EDDFC8'},
  {tier:'Titanium', code:'TG', name:'Midtown Grey',           swatch:'#5B6069'},
  {tier:'Titanium', code:'AA', name:'Blaze Black Shaker',     swatch:'#1C1B1A'},
  {tier:'Titanium', code:'AH', name:'Homestead Oak Shaker',   swatch:'#B99050'},
];

// Real supplier catalog stays visible only to these two accounts (matches OWNER_USER_IDS
// in netlify/functions/stripe-webhook.js) — every other account, including new signups
// who haven't set up their own styles yet, gets the generic DEFAULT_STYLES instead.
const OWNER_USER_IDS = [
  'f464edfb-8f74-49b7-b366-79b89605bbb7', // Dan
  'd7620158-9fbd-44de-9770-2f00bdabe71c', // Sister
];
