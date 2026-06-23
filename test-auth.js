const auth = require('./api/auth');

const req = {
  method: 'POST',
  headers: {},
  body: {
    credential: 'fake'
  }
};

const res = {
  setHeader: () => {},
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log('Status:', this.statusCode);
    console.log('Data:', data);
  },
  end: function() {
    console.log('Status:', this.statusCode);
  }
};

auth(req, res).then(() => console.log('Done')).catch(console.error);
