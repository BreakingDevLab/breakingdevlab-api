const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const nodemailer = require('nodemailer');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass }
  });
}

const transporter = createTransporter();
const TO_EMAIL = process.env.TO_EMAIL || process.env.SMTP_USER || 'hello@breakingdevlab.example';

function validate(fields, required) {
  const errors = [];
  required.forEach(k => {
    if (!fields[k] || String(fields[k]).trim() === '') errors.push(k);
  });
  return errors;
}

async function handleForm(req, res, opts) {
  try {
    if (req.body[opts.honeypot] && req.body[opts.honeypot].trim() !== '') {
      return res.status(400).json({ ok: false, message: 'Spam detected' });
    }

    const missing = validate(req.body, opts.required);
    if (missing.length) {
      return res.status(400).json({ ok: false, message: 'Missing fields', missing });
    }

    const payload = {
      name: req.body.name || '',
      contact: req.body.email || req.body.contact || '',
      message: req.body.message || req.body.project || '',
      selected_service: req.body.selected_service || ''
    };

    const subject = opts.subjectPrefix + (payload.selected_service ? ` — ${payload.selected_service}` : '');
    const text = `New submission\n\nName: ${payload.name}\nContact: ${payload.contact}\nService: ${payload.selected_service}\n\nMessage:\n${payload.message}`;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"Breaking Dev Lab" <${process.env.SMTP_FROM || TO_EMAIL}>`,
          to: TO_EMAIL,
          subject,
          text
        });
      } catch (mailErr) {
        console.error('Mail send failed:', mailErr);
        // continue — do not fail the whole request because email couldn't be sent
      }
    } else {
      console.log('Email not sent (no SMTP configured). Payload:\n', text);
    }

    return res.json({ ok: true, message: 'Received' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

app.post('/api/lead', (req, res) => {
  return handleForm(req, res, {
    required: ['name', 'contact'],
    honeypot: 'hp_inline',
    subjectPrefix: 'Lead form'
  });
});

app.post('/api/quote', (req, res) => {
  return handleForm(req, res, {
    required: ['name', 'email'],
    honeypot: 'hp_page',
    subjectPrefix: 'Quote request'
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
