'use strict';
const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => res.render('index'));
router.get('/respostas', (_req, res) => res.render('respostas'));
router.get('/form-visitas', (_req, res) => res.render('form-visitas'));
router.get('/politica-privacidade', (_req, res) => res.render('politica-privacidade'));

module.exports = router;
