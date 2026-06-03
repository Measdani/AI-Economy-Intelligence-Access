const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const CONFIG = {
  DATA_DIR: process.env.DATA_DIR || './calculator_data',
  EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'smtp',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@energyandwealth.com',
  ENTERPRISE_EMAIL: process.env.ENTERPRISE_EMAIL || 'enterprise@energyandwealth.com',
  WEBSITE_URL: process.env.WEBSITE_URL || 'https://naierm.com',
  STRIPE_MONTHLY_PRODUCT_ID: process.env.STRIPE_MONTHLY_PRODUCT_ID || null,
  WORKFLOW_DIR: __dirname
};

const RAW_IMPORTS_PATH = path.join(CONFIG.WORKFLOW_DIR, 'raw_data_center_imports.json');
const VERIFIED_DATA_CENTERS_PATH = path.join(CONFIG.WORKFLOW_DIR, 'verified_state_data_centers.json');

app.get(['/', '/calculator-preview'], (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'calculator-preview.html'));
});

app.get('/enterprise', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'enterprise.html'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'calculator-preview.html'));
});

app.get('/billing', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'calculator-preview.html'));
});

app.get('/subscription', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'calculator-preview.html'));
});

app.get('/signin', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'signin.html'));
});

app.get('/team-test', (req, res) => {
  res.sendFile(path.join(CONFIG.WORKFLOW_DIR, 'team-test.html'));
});

app.post('/api/team-test/access', (req, res) => {
  const { code } = req.body || {};
  const expectedCode = process.env.TEAM_TEST_CODE || 'EW-TEST-2026';

  if (!code || String(code).trim() !== expectedCode) {
    return res.status(401).json({ success: false, error: 'Invalid access code.' });
  }

  res.json({
    success: true,
    access: 'active',
    redirectUrl: '/account'
  });
});

app.get('/verified_state_data_centers.json', (req, res) => {
  res.sendFile(VERIFIED_DATA_CENTERS_PATH);
});

// POST - Submit form
app.post('/api/calculator/submit', async (req, res) => {
  try {
    const { name, email, category, vulnerabilityScore, timestamp } = req.body;

    if (!name || !email || !category) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const submission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...req.body,
      submittedAt: timestamp || new Date().toISOString()
    };

    // Save to file
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    const filePath = path.join(CONFIG.DATA_DIR, `${submission.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(submission, null, 2));

    // Append to index
    const indexPath = path.join(CONFIG.DATA_DIR, '_index.jsonl');
    await fs.appendFile(indexPath, JSON.stringify(submission) + '\n');

    // Send email asynchronously
    sendResultsEmail(submission).catch(err => console.error('Email error:', err));

    res.json({
      success: true,
      submissionId: submission.id,
      message: 'Submission received'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET - View submissions
app.get('/api/calculator/submissions', async (req, res) => {
  try {
    const indexPath = path.join(CONFIG.DATA_DIR, '_index.jsonl');
    const data = await fs.readFile(indexPath, 'utf-8');
    const submissions = data.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    
    submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    res.json({
      success: true,
      total: submissions.length,
      submissions: submissions.slice(0, 100)
    });
  } catch (error) {
    res.json({ success: true, total: 0, submissions: [] });
  }
});

// GET - Export as JSON
app.get('/api/calculator/export', async (req, res) => {
  try {
    const indexPath = path.join(CONFIG.DATA_DIR, '_index.jsonl');
    const data = await fs.readFile(indexPath, 'utf-8');
    const submissions = data.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="submissions.json"`);
    res.json({ exportedAt: new Date().toISOString(), submissions });
  } catch (error) {
    res.json({ submissions: [] });
  }
});

app.post('/api/enterprise/contact', async (req, res) => {
  try {
    const { name, email, organization, role, accessType, message, timestamp } = req.body;

    if (!name || !email || !organization) {
      return res.status(400).json({ success: false, error: 'Name, email, and organization are required' });
    }

    const inquiry = {
      id: `enterprise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      email,
      organization,
      role: role || '',
      accessType: accessType || '',
      message: message || '',
      submittedAt: timestamp || new Date().toISOString(),
      destination: CONFIG.ENTERPRISE_EMAIL
    };

    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(CONFIG.DATA_DIR, `${inquiry.id}.json`), JSON.stringify(inquiry, null, 2));
    await fs.appendFile(path.join(CONFIG.DATA_DIR, '_enterprise_index.jsonl'), JSON.stringify(inquiry) + '\n');

    sendEnterpriseInquiryEmail(inquiry).catch(err => console.error('Enterprise email error:', err));

    res.json({ success: true, inquiryId: inquiry.id, message: 'Enterprise inquiry received' });
  } catch (error) {
    console.error('Enterprise inquiry error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/stripe/create-portal-session', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'No billing account found.' });
    }

    if (process.env.STRIPE_CUSTOMER_PORTAL_URL) {
      return res.json({ success: true, url: process.env.STRIPE_CUSTOMER_PORTAL_URL });
    }

    return res.status(501).json({
      success: false,
      error: 'Stripe portal is not configured. Add STRIPE_CUSTOMER_PORTAL_URL or wire this endpoint to your Stripe server SDK.'
    });
  } catch (error) {
    console.error('Stripe portal session error:', error);
    res.status(500).json({ success: false, error: 'Unable to create Stripe portal session.' });
  }
});

app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const rawDomain = process.env.DOMAIN || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const domain = /^https?:\/\//i.test(rawDomain) ? rawDomain : `https://${rawDomain}`;
    const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(501).json({
        success: false,
        error: 'Stripe checkout is not configured. Add STRIPE_SECRET_KEY.'
      });
    }

    if (!priceId) {
      return res.status(501).json({
        success: false,
        error: `Stripe monthly price is not configured. Add STRIPE_MONTHLY_PRICE_ID${CONFIG.STRIPE_MONTHLY_PRODUCT_ID ? ` for product ${CONFIG.STRIPE_MONTHLY_PRODUCT_ID}` : ''}.`
      });
    }

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('subscription_data[trial_period_days]', '7');
    params.append('success_url', `${domain}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${domain}/calculator-preview?view=plans`);

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const payload = await stripeResponse.json();
    if (!stripeResponse.ok) {
      return res.status(stripeResponse.status).json({
        success: false,
        error: payload?.error?.message || 'Unable to create Stripe Checkout session.'
      });
    }

    res.json({ success: true, url: payload.url, sessionId: payload.id });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).json({ success: false, error: error.message || 'Unable to create Stripe Checkout session.' });
  }
});

app.post('/api/stripe/verify-checkout-session', async (req, res) => {
  try {
    const { sessionId } = req.body || {};

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(501).json({ success: false, error: 'Stripe is not configured.' });
    }

    if (!sessionId || !String(sessionId).startsWith('cs_')) {
      return res.status(400).json({ success: false, error: 'A valid checkout session is required.' });
    }

    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`
      }
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      return res.status(stripeResponse.status).json({
        success: false,
        error: session?.error?.message || 'Unable to verify checkout session.'
      });
    }

    let subscription = session.subscription;
    if (typeof subscription === 'string') {
      const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscription)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`
        }
      });

      const subscriptionPayload = await subscriptionResponse.json();
      if (!subscriptionResponse.ok) {
        return res.status(subscriptionResponse.status).json({
          success: false,
          error: subscriptionPayload?.error?.message || 'Unable to verify subscription status.'
        });
      }
      subscription = subscriptionPayload;
    }

    const subscriptionStatus = typeof subscription === 'object' ? subscription.status : null;
    const hasActiveAccess =
      session.mode === 'subscription' &&
      session.payment_status !== 'unpaid' &&
      ['active', 'trialing'].includes(subscriptionStatus);

    if (!hasActiveAccess) {
      return res.status(403).json({
        success: false,
        error: 'Checkout session does not have active subscription access.'
      });
    }

    res.json({
      success: true,
      access: 'active',
      subscriptionStatus,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      subscriptionId: typeof subscription === 'object' ? subscription.id : subscription || null,
      trialEnd: typeof subscription === 'object' && subscription.trial_end ? subscription.trial_end : null,
      nextBillingDate: typeof subscription === 'object' && subscription.current_period_end ? subscription.current_period_end : null
    });
  } catch (error) {
    console.error('Stripe checkout verification error:', error);
    res.status(500).json({ success: false, error: error.message || 'Unable to verify checkout session.' });
  }
});

app.get('/api/admin/data-centers/review', async (req, res) => {
  try {
    const [rawImports, verifiedRows] = await Promise.all([
      readJsonFile(RAW_IMPORTS_PATH, []),
      readJsonFile(VERIFIED_DATA_CENTERS_PATH, [])
    ]);

    res.json({
      success: true,
      rawImports,
      verifiedRows,
      rows: rawImports.map((row) => {
        const currentVerified = verifiedRows.find((verified) => verified.state === row.state) || null;
        return {
          ...row,
          currentVerified,
          hasUpdate: rawDiffersFromVerified(row, currentVerified)
        };
      })
    });
  } catch (error) {
    console.error('Review load error:', error);
    res.status(500).json({ success: false, error: 'Unable to load review rows' });
  }
});

app.post('/api/admin/data-centers/import-latest', async (req, res) => {
  try {
    const [rawImports, verifiedRows] = await Promise.all([
      readJsonFile(RAW_IMPORTS_PATH, []),
      readJsonFile(VERIFIED_DATA_CENTERS_PATH, [])
    ]);
    const sampleRows = buildMockDataCenterImportRows();
    const rowsToAdd = sampleRows.filter((row) => {
      const verified = verifiedRows.find((item) => item.state === row.state);
      const matchingUnreviewed = rawImports.find((item) =>
        item.state === row.state &&
        item.status === 'unreviewed' &&
        rawValuesEqual(item, row)
      );
      return !matchingUnreviewed && rawDiffersFromVerified(row, verified);
    });

    const updatedRawImports = [...rawImports, ...rowsToAdd];
    await writeJsonFile(RAW_IMPORTS_PATH, updatedRawImports);

    res.json({
      success: true,
      imported: rowsToAdd.length,
      skipped: sampleRows.length - rowsToAdd.length,
      rawImports: updatedRawImports
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, error: 'Unable to import latest data' });
  }
});

app.post('/api/admin/data-centers/:id/approve', async (req, res) => {
  try {
    const rawImports = await readJsonFile(RAW_IMPORTS_PATH, []);
    const verifiedRows = await readJsonFile(VERIFIED_DATA_CENTERS_PATH, []);
    const rawIndex = rawImports.findIndex((row) => row.id === req.params.id);
    if (rawIndex < 0) {
      return res.status(404).json({ success: false, error: 'Raw import not found' });
    }

    const approvedRaw = { ...rawImports[rawIndex], ...(req.body?.edits || {}) };
    const verifiedRecord = rawImportToVerifiedRecord(approvedRaw, req.body?.verifiedBy || 'admin');
    const verifiedIndex = verifiedRows.findIndex((row) => row.state === verifiedRecord.state);
    if (verifiedIndex >= 0) {
      verifiedRows[verifiedIndex] = verifiedRecord;
    } else {
      verifiedRows.push(verifiedRecord);
    }
    rawImports[rawIndex] = { ...approvedRaw, status: 'verified' };

    await Promise.all([
      writeJsonFile(RAW_IMPORTS_PATH, rawImports),
      writeJsonFile(VERIFIED_DATA_CENTERS_PATH, verifiedRows)
    ]);

    res.json({ success: true, verifiedRecord, rawImports, verifiedRows });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ success: false, error: 'Unable to approve import' });
  }
});

app.post('/api/admin/data-centers/:id/reject', async (req, res) => {
  try {
    const rawImports = await readJsonFile(RAW_IMPORTS_PATH, []);
    const rawIndex = rawImports.findIndex((row) => row.id === req.params.id);
    if (rawIndex < 0) {
      return res.status(404).json({ success: false, error: 'Raw import not found' });
    }
    rawImports[rawIndex] = { ...rawImports[rawIndex], status: 'rejected' };
    await writeJsonFile(RAW_IMPORTS_PATH, rawImports);
    res.json({ success: true, rawImports });
  } catch (error) {
    console.error('Reject error:', error);
    res.status(500).json({ success: false, error: 'Unable to reject import' });
  }
});

// GET - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Calculator API' });
});

app.get('/admin/data-review', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'data-review.html'));
});

// Send email helper
async function sendResultsEmail(data) {
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  const html = `
    <h1>Your Assessment Results</h1>
    <p><strong>Score:</strong> ${Math.round(data.vulnerabilityScore)}/100</p>
    <p><strong>Category:</strong> ${data.category}</p>
    <p>Thank you for taking the assessment!</p>
    <p><a href="${CONFIG.WEBSITE_URL}">Explore NAiERM</a></p>
  `;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: data.email,
    subject: 'Your Assessment Results',
    html
  });

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: CONFIG.ADMIN_EMAIL,
    subject: `New Submission: ${data.name}`,
    html: `<pre>${JSON.stringify(data, null, 2)}</pre>`
  });
}

async function sendEnterpriseInquiryEmail(data) {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  const html = `
    <h1>Enterprise Energy & AI Economy Intelligence Inquiry</h1>
    <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Organization:</strong> ${escapeHtml(data.organization)}</p>
    <p><strong>Role:</strong> ${escapeHtml(data.role || 'Not provided')}</p>
    <p><strong>Access Type:</strong> ${escapeHtml(data.accessType || 'Not provided')}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(data.message || 'No message provided').replace(/\n/g, '<br>')}</p>
    <hr>
    <p><strong>Submitted:</strong> ${escapeHtml(data.submittedAt)}</p>
  `;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: CONFIG.ENTERPRISE_EMAIL,
    replyTo: data.email,
    subject: `Enterprise Inquiry: ${data.organization}`,
    html
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function readJsonFile(filePath, fallback) {
  try {
    const content = (await fs.readFile(filePath, 'utf-8')).replace(/^\uFEFF/, '');
    return JSON.parse(content);
  } catch (error) {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

function buildMockDataCenterImportRows() {
  const importedAt = new Date().toISOString();
  const runId = Date.now();
  const rows = [
    {
      id: `baxtel-al-${runId}`,
      state: 'Alabama',
      abbreviation: 'AL',
      sourceName: 'Baxtel',
      sourceUrl: 'https://baxtel.com/data-center/alabama',
      rawTotalDataCenters: 40,
      rawPlannedDataCenters: null,
      rawUnderConstructionDataCenters: null,
      rawPipelineDataCenters: null,
      rawProviderCount: 19,
      rawLargestFacility: 'Google Bridgeport',
      rawLargestFacilityMW: 50,
      rawNotes: 'Baxtel market listing import. Cleanview planned and under-construction fields pending.'
    },
    mockMissingImport('Georgia', 'GA', 'https://baxtel.com/data-center/georgia'),
    mockMissingImport('Texas', 'TX', 'https://baxtel.com/data-center/texas'),
    mockMissingImport('Virginia', 'VA', 'https://baxtel.com/data-center/virginia'),
    mockMissingImport('Arizona', 'AZ', 'https://baxtel.com/data-center/arizona')
  ];

  return rows.map((row, index) => ({
    id: row.id || `baxtel-${row.abbreviation.toLowerCase()}-${runId}-${index}`,
    importedAt,
    status: 'unreviewed',
    ...row
  }));
}

function mockMissingImport(state, abbreviation, sourceUrl) {
  return {
    state,
    abbreviation,
    sourceName: 'Baxtel',
    sourceUrl,
    rawTotalDataCenters: null,
    rawPlannedDataCenters: null,
    rawUnderConstructionDataCenters: null,
    rawPipelineDataCenters: null,
    rawProviderCount: null,
    rawLargestFacility: null,
    rawLargestFacilityMW: null,
    rawNotes: 'Mock row created for admin workflow. Values intentionally missing until source import is verified.'
  };
}

function rawImportToVerifiedRecord(rawRow, verifiedBy) {
  return {
    state: rawRow.state,
    abbreviation: rawRow.abbreviation,
    totalDataCenters: toNullableNumber(rawRow.rawTotalDataCenters),
    plannedDataCenters: toNullableNumber(rawRow.rawPlannedDataCenters),
    underConstructionDataCenters: toNullableNumber(rawRow.rawUnderConstructionDataCenters),
    pipelineDataCenters: toNullableNumber(rawRow.rawPipelineDataCenters),
    providerCount: toNullableNumber(rawRow.rawProviderCount),
    largestFacility: rawRow.rawLargestFacility || null,
    largestFacilityMW: toNullableNumber(rawRow.rawLargestFacilityMW),
    sourceName: rawRow.sourceName,
    sourceUrl: rawRow.sourceUrl,
    verifiedAt: new Date().toISOString(),
    verifiedBy,
    methodologyNote: rawRow.rawNotes
  };
}

function rawDiffersFromVerified(rawRow, verifiedRow) {
  if (!verifiedRow) return hasAnyRawValue(rawRow);
  return (
    !sameValue(rawRow.rawTotalDataCenters, verifiedRow.totalDataCenters) ||
    !sameValue(rawRow.rawPlannedDataCenters, verifiedRow.plannedDataCenters) ||
    !sameValue(rawRow.rawUnderConstructionDataCenters, verifiedRow.underConstructionDataCenters) ||
    !sameValue(rawRow.rawPipelineDataCenters, verifiedRow.pipelineDataCenters) ||
    !sameValue(rawRow.rawProviderCount, verifiedRow.providerCount) ||
    !sameValue(rawRow.rawLargestFacility, verifiedRow.largestFacility) ||
    !sameValue(rawRow.rawLargestFacilityMW, verifiedRow.largestFacilityMW)
  );
}

function rawValuesEqual(left, right) {
  return (
    sameValue(left.rawTotalDataCenters, right.rawTotalDataCenters) &&
    sameValue(left.rawPlannedDataCenters, right.rawPlannedDataCenters) &&
    sameValue(left.rawUnderConstructionDataCenters, right.rawUnderConstructionDataCenters) &&
    sameValue(left.rawPipelineDataCenters, right.rawPipelineDataCenters) &&
    sameValue(left.rawProviderCount, right.rawProviderCount) &&
    sameValue(left.rawLargestFacility, right.rawLargestFacility) &&
    sameValue(left.rawLargestFacilityMW, right.rawLargestFacilityMW)
  );
}

function hasAnyRawValue(rawRow) {
  return [
    rawRow.rawTotalDataCenters,
    rawRow.rawPlannedDataCenters,
    rawRow.rawUnderConstructionDataCenters,
    rawRow.rawPipelineDataCenters,
    rawRow.rawProviderCount,
    rawRow.rawLargestFacility,
    rawRow.rawLargestFacilityMW
  ].some((value) => value !== null && value !== undefined && value !== '');
}

function sameValue(left, right) {
  return (left ?? null) === (right ?? null);
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Calculator API running on port ${PORT}`);
  });
}

module.exports = app;
