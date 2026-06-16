// Demo brownfield: un servicio legacy SIN spec. `conductor explain` lo radiografía.
const express = require('express');
const app = express();

// @conductor REQ-ORDER-LISTING
app.get('/api/orders', (req, res) => {
  res.json(listOrders(req.query.status));
});

// @conductor REQ-ORDER-DETAIL
app.get('/api/orders/:id', (req, res) => {
  res.json(getOrder(req.params.id));
});

// @conductor REQ-ORDER-CREATION
app.post('/api/orders', (req, res) => {
  res.status(201).json(createOrder(req.body));
});

function listOrders(status) { return []; }
function getOrder(id) { return { id, status: 'pending', discountCode: null }; }
function createOrder(payload) { return { id: 'o-1', ...payload }; }

module.exports = { app, listOrders, getOrder, createOrder };
