import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonApp, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonInput, IonItem, IonLabel
} from '@ionic/angular/standalone';
import { io, Socket } from 'socket.io-client';

type ChatMsg = { room: string; from: string; to: string; text: string; ts: number };

const API = 'http://localhost:4000';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonApp, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonInput, IonItem, IonLabel,
    FormsModule, CommonModule
  ]
})
export class AppComponent implements OnInit {
  // Auth/UI
  registerMode = false;
  loggedIn = false;
  loading = false;
  error = '';

  // Credentials
  me = '';                 // auch im Login-Form genutzt
  password = '';
  token: string | null = localStorage.getItem('token');

  // Chat
  socket!: Socket;
  peer = '';
  room = '';
  msg = '';
  feed: ChatMsg[] = [];

  ngOnInit() {
    // Für Debug aus der Browserkonsole:
    (window as any).app = this;

    // Auto-Login falls vorhanden
    const savedUser = localStorage.getItem('me');
    if (this.token && savedUser) {
      this.me = savedUser;
      this.loggedIn = true;
      this.connectSocket();
    }
  }

  // ---------- Helpers ----------
  private norm(s: string) { return (s || '').trim().toLowerCase(); }

  // ---------- Auth ----------
  async register() {
    this.error = '';
    if (!this.me || !this.password) {
      this.error = 'Bitte Benutzername und Passwort eingeben.';
      return;
    }
    this.loading = true;
    try {
      const uname = this.norm(this.me);
      const resp = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: uname,
          password: this.password,
          publicKey: 'PUBKEY_PLACEHOLDER' // E2E kommt später wieder dazu
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Registrierung fehlgeschlagen');
      this.registerMode = false; // zurück zum Login
      console.log('[AUTH] registered:', uname);
    } catch (e: any) {
      this.error = e?.message || String(e);
      console.warn('[AUTH] register error:', e);
    } finally {
      this.loading = false;
    }
  }

  async login() {
    this.error = '';
    if (!this.me || !this.password) {
      this.error = 'Bitte Benutzername und Passwort eingeben.';
      return;
    }
    this.loading = true;
    try {
      const uname = this.norm(this.me);
      const resp = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: this.password })
      });
      const data = await resp.json();
      if (!resp.ok || !data?.token) throw new Error(data?.error || 'Login fehlgeschlagen');

      this.me = uname;
      this.token = data.token as string;
      localStorage.setItem('token', this.token);
      localStorage.setItem('me', this.me);

      this.loggedIn = true;
      console.log('[AUTH] logged in as:', this.me);
      this.connectSocket();
    } catch (e: any) {
      this.error = e?.message || String(e);
      console.warn('[AUTH] login error:', e);
    } finally {
      this.loading = false;
    }
  }

  logout() {
    this.loggedIn = false;
    this.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('me');
    try { this.socket?.disconnect(); } catch {}
    this.feed = [];
    this.room = '';
    this.peer = '';
    this.msg = '';
    console.log('[AUTH] logged out');
  }

  // ---------- Socket / Chat ----------
  private connectSocket() {
    this.socket = io(API, {
      auth: { token: this.token ?? '' }, // Fix gegen TS2345 + leeres Token
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500
    });

    (window as any).socket = this.socket; // Debug

    this.socket.on('connect', () => {
      this.error = '';
      console.log('[SOCKET] connected, id=', this.socket.id);
    });

    this.socket.on('connect_error', (err: any) => {
      console.warn('[SOCKET] connect_error:', err?.message || err);
      this.error = 'Server nicht erreichbar oder Token ungültig.';
    });

    this.socket.on('chat:recv', (msg: ChatMsg) => {
      console.log('[RECV] <-', msg);
      if (msg.room === this.room) this.feed.push(msg);
    });
  }

  async join() {
    this.error = '';
    const me = this.norm(this.me);
    const peerTrim = this.norm(this.peer);
    if (!this.loggedIn || !peerTrim) {
      this.error = 'Bitte eingeloggt sein und einen Chat-Partner eingeben.';
      return;
    }
    this.me = me;
    this.peer = peerTrim;

    this.room = [this.me, this.peer].sort().join('|');
    (window as any).room = this.room; // Debug: in Konsole `room` prüfen
    console.log('[JOIN] -> me:', this.me, 'peer:', this.peer, 'room:', this.room);

    this.feed = [];
    this.socket.emit('room:join', this.room);

    try {
      const resp = await fetch(`${API}/history/${encodeURIComponent(this.room)}`);
      if (resp.ok) {
        const arr = await resp.json();
        this.feed = Array.isArray(arr) ? arr : [];
      }
    } catch (e) {
      console.warn('[JOIN] history fetch failed', e);
    }
  }

  send() {
    this.error = '';
    const text = this.msg.trim();
    if (!text) return;
    if (!this.room) {
      this.error = 'Bitte zuerst einem Raum beitreten.';
      return;
    }
    if (!this.loggedIn) {
      this.error = 'Bitte zuerst einloggen.';
      return;
    }

    const msg: ChatMsg = {
      room: this.room,
      from: this.me,
      to: this.peer,
      text,
      ts: Date.now()
    };
    console.log('[SEND] ->', msg);
    this.socket.emit('chat:send', msg);

    // Optimistic UI
    this.feed.push(msg);
    this.msg = '';
  }
}
