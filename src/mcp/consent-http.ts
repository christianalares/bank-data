import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  activateBankConsent,
  completeBankConsent,
  getBankSelection,
  getConsentRedirectUrl,
  hasValidSelectionFormToken,
  makeSelectionCookie,
  makeSelectionFormToken,
  readSelectionCookie,
} from '../banking/consent-service'

const COOKIE_NAME = 'hv_bank_selection'

export async function handleBankConsentHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; form-action 'self'; base-uri 'none'",
  )

  if (url.pathname === '/banking/callback' && request.method === 'GET') {
    if (url.searchParams.has('error')) {
      sendHtml(response, 400, '<h1>Bank authorization was not completed</h1>')
      return
    }
    try {
      const result = await completeBankConsent(
        url.searchParams.get('code') ?? '',
        url.searchParams.get('state') ?? '',
      )
      if (result.needsSelection) {
        response.setHeader(
          'Set-Cookie',
          `${COOKIE_NAME}=${makeSelectionCookie(result.connectionId)}; HttpOnly; Secure; SameSite=None; Path=/banking; Max-Age=900`,
        )
        response.setHeader('Location', '/banking/select')
        response.statusCode = 303
        response.end()
        return
      }
      sendHtml(
        response,
        200,
        '<h1>Bank connected</h1><p>The selected business accounts are ready for sync.</p>',
      )
    } catch {
      sendHtml(
        response,
        400,
        '<h1>Bank authorization could not be completed</h1><p>Start a new consent and try again.</p>',
      )
    }
    return
  }

  if (url.pathname === '/banking/select' && request.method === 'GET') {
    const selectionCookie = getCookie(request, COOKIE_NAME)
    const connectionId = readSelectionCookie(selectionCookie)
    if (!connectionId) {
      sendHtml(response, 403, '<h1>Account selection expired</h1>')
      return
    }
    try {
      const accounts = await getBankSelection(connectionId)
      response.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${selectionCookie}; HttpOnly; Secure; SameSite=None; Path=/banking; Max-Age=900`,
      )
      const rows = accounts
        .map(
          (account) =>
            `<label><input type="checkbox" name="account" value="${account.id}"${account.included ? ' checked' : ''}> ${escapeHtml(account.name)} (${escapeHtml(account.currency)})</label><br>`,
        )
        .join('')
      sendHtml(
        response,
        200,
        `<h1>Select accounts to sync</h1><form method="post" action="/banking/select"><input type="hidden" name="csrf" value="${makeSelectionFormToken(selectionCookie as string)}">${rows}<button type="submit">Save selection</button></form>`,
      )
    } catch {
      sendHtml(response, 403, '<h1>Account selection is no longer available</h1>')
    }
    return
  }

  if (url.pathname === '/banking/select' && request.method === 'POST') {
    const selectionCookie = getCookie(request, COOKIE_NAME)
    const connectionId = readSelectionCookie(selectionCookie)
    const expectedOrigin = new URL(getConsentRedirectUrl()).origin
    const originState =
      request.headers.origin === undefined
        ? 'missing'
        : request.headers.origin === expectedOrigin
          ? 'expected'
          : 'other'
    const formContentType =
      request.headers['content-type']?.startsWith('application/x-www-form-urlencoded') === true
    if (!connectionId || originState === 'other' || !formContentType) {
      console.warn('Bank account selection rejected', {
        phase: 'request',
        cookieValid: Boolean(connectionId),
        originState,
        formContentType,
      })
      sendHtml(response, 403, '<h1>Account selection is not authorized</h1>')
      return
    }
    try {
      const body = await readSmallBody(request)
      const form = new URLSearchParams(body)
      if (!hasValidSelectionFormToken(selectionCookie as string, form.get('csrf'))) {
        console.warn('Bank account selection rejected', {
          phase: 'form',
          tokenPresent: form.has('csrf'),
        })
        sendHtml(response, 403, '<h1>Account selection is not authorized</h1>')
        return
      }
      const selectedIds = form.getAll('account')
      await activateBankConsent(connectionId, selectedIds)
      response.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/banking; Max-Age=0`,
      )
      sendHtml(response, 200, '<h1>Bank connected</h1><p>Your account selection was saved.</p>')
    } catch {
      sendHtml(
        response,
        400,
        '<h1>Account selection could not be saved</h1><p>Select at least one account and try again.</p>',
      )
    }
    return
  }

  response.setHeader('Allow', url.pathname === '/banking/select' ? 'GET, POST' : 'GET')
  sendHtml(response, 405, '<h1>Method not allowed</h1>')
}

function getCookie(request: IncomingMessage, name: string) {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

async function readSmallBody(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) {
    body += chunk.toString()
    if (body.length > 8192) {
      throw new Error('Selection form is too large')
    }
  }
  return body
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  )
}

function sendHtml(response: ServerResponse, status: number, body: string) {
  response.statusCode = status
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Bank consent</title><body>${body}</body></html>`,
  )
}
