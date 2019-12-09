const express = require('express');
require('dotenv').config()

const indexRouter = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use('/', indexRouter);
app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));