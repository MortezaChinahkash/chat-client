import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonApp, IonRouterOutlet, IonContent,
  IonHeader, IonToolbar, IonTitle,
  IonFooter, IonButtons, IonButton, IonInput,
  IonItem, IonIcon
} from '@ionic/angular/standalone';
import { io, Socket } from 'socket.io-client';
import { CryptoService } from './crypto.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    // Ionic
    IonApp, IonRouterOutlet, IonContent,
    IonHeader, IonToolbar, IonTitle,
    IonFooter, IonButtons, IonButton, IonInput,
    IonItem, IonIcon,
    // Angular
    FormsModule, CommonModule
  ],
})
export class AppComponent {
  @ViewChild(IonContent) content!: IonContent;

  // Socket & state
  socket!: Socket;
  joined = false;

  me = '';
  peer = '';
  peerPub?: string;
  room = '';

  msg = '';
  feed: Array<{ from: string; text: string; ts: number }> = [];

  // UI-Extras
  peerOnline = false;
  isTyping = false;
  private typingTimeout?: any;

  constructor(private crypto: CryptoService) {
    // Verbindung zum Server (Fallbacks erlaubt)
    this.socket = io('http://localhost:4000');

    // Server-„Hallo“ (nur Test)
    this.socket.on('hello', (msg) => console.log('SERVER:', msg));

    // Live eingehende Nachrichten (mit Entschlüsselung)
    this.socket.on('chat:recv', async (msg: any) => {
      if (msg.room !== this.room) return;

      let shown = msg.text; // Fallback für Altformat
      try {
        if (msg.encrypted) {
          if (msg.to === this.me && msg.cipherTo) {
            shown = await this.crypto.decryptFromMe('', msg.cipherTo);
          } else if (msg.from === this.me && msg.cipherFrom) {
            shown = await this.crypto.decryptFromMe('', msg.cipherFrom);
          } else if (msg.text) {
            try { shown = await this.crypto.decryptFromMe('', msg.text); } catch {}
          }
        }
      } catch {
        shown = '[encrypted]';
      }

      this.feed.push({ from: msg.from, text: shown, ts: msg.ts });
      this.scrollToBottom();
    });

    // Präsenz-Updates
    this.socket.on('presence:update', (data: any) => {
      if (data?.user === this.peer) this.peerOnline = !!data.online;
    });

    // Typing-Indikator
    this.socket.on('typing', (data: any) => {
      if (data?.from === this.peer && data.room === this.room) {
        this.isTyping = true;
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => (this.isTyping = false), 1200);
      }
    });

    // Debug optional
    (window as any).socket = this.socket;
  }

  // ---------- UI helpers ----------
  private scrollToBottom() {
    setTimeout(() => this.content?.scrollToBottom(300), 50);
  }

  onFocus() { this.emitTyping(); }
  onBlur()  { this.isTyping = false; }

  emitTyping() {
    if (!this.joined || !this.room) return;
    this.socket.emit('typing', { room: this.room, from: this.me });
  }

  // ---------- Server helpers ----------
  private async fetchPeerKey(username: string, tries = 10, delayMs = 1000): Promise<string | undefined> {
    for (let i = 0; i < tries; i++) {
      const r = await fetch(`http://localhost:4000/user/${encodeURIComponent(username)}`);
      if (r.ok) return (await r.json()).publicKey as string;
      await new Promise(res => setTimeout(res, delayMs));
    }
    return undefined;
  }

  // ---------- Actions ----------
  async join() {
    if (!this.me || !this.peer) return;

    await this.crypto.init();
    this.feed = [];
    this.room = [this.me, this.peer].sort().join('|');

    // Room & Präsenz
    this.socket.emit('room:join', this.room);
    this.socket.emit('presence:online', { user: this.me });

    // eigenen Public Key hochladen
    await fetch('http://localhost:4000/user/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.me, publicKey: this.crypto.me!.pub })
    });

    // Peer-Key (mit kleinem Retry)
    this.peerPub = await this.fetchPeerKey(this.peer);
    if (!this.peerPub) console.warn('Kein Public Key für', this.peer, 'gefunden.');

    // Verlauf laden & passend entschlüsseln
    const resp = await fetch(`http://localhost:4000/history/${encodeURIComponent(this.room)}`);
    const arr: any[] = await resp.json();

    const out: Array<{ from: string; text: string; ts: number }> = [];
    for (const m of arr) {
      let shown = m.text;
      try {
        if (m.encrypted) {
          if (m.to === this.me && m.cipherTo) {
            shown = await this.crypto.decryptFromMe('', m.cipherTo);
          } else if (m.from === this.me && m.cipherFrom) {
            shown = await this.crypto.decryptFromMe('', m.cipherFrom);
          } else if (m.text) {
            try { shown = await this.crypto.decryptFromMe('', m.text); } catch {}
          }
        }
      } catch {
        shown = '[encrypted]';
      }
      out.push({ from: m.from, text: shown, ts: m.ts });
    }

    this.feed = out;
    this.joined = true;
    this.scrollToBottom();
  }

  async send() {
    const text = this.msg.trim();
    if (!text || !this.room || !this.peerPub) return;

    // Dual-Cipher: für Peer + für mich selbst
    const cipherTo   = await this.crypto.encryptFor(this.peerPub, text);
    const cipherFrom = await this.crypto.encryptFor(this.crypto.me!.pub, text);

    this.socket.emit('chat:send', {
      room: this.room,
      from: this.me,
      to: this.peer,
      cipherTo,
      cipherFrom,
      encrypted: true,
      ts: Date.now(),
    });

    this.msg = '';
    this.emitTyping(); // kurzer Ping, fühlt sich „live“ an
  }
}
