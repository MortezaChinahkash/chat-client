import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { io, Socket } from 'socket.io-client';
import { CryptoService } from './crypto.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, FormsModule, CommonModule],
})
export class AppComponent {
  socket!: Socket;

  me = 'alice';
  peer = 'bob';
  msg = '';
  room = '';
  feed: Array<{ from: string; text: string; ts: number }> = [];
  peerPub?: string;

  constructor(private crypto: CryptoService) {
    this.socket = io('http://localhost:4000');
    this.crypto.init();

    // Begrüßung (Test)
    this.socket.on('hello', (msg) => console.log('SERVER SAGT:', msg));

    // Eingehende Nachrichten verarbeiten (mit Entschlüsselung, falls encrypted)
    this.socket.on('chat:recv', async (msg: any) => {
      try {
        if (msg.room !== this.room) return;
    
        let shown = msg.text; // Fallback für ganz alte Nachrichten
    
        if (msg.encrypted) {
          if (msg.to === this.me && msg.cipherTo) {
            shown = await this.crypto.decryptFromMe('', msg.cipherTo);
          } else if (msg.from === this.me && msg.cipherFrom) {
            shown = await this.crypto.decryptFromMe('', msg.cipherFrom);
          } else if (msg.text) {
            // Migrations-Fallback: probier alten Text zu öffnen
            try { shown = await this.crypto.decryptFromMe('', msg.text); } catch {}
          }
        }
    
        this.feed.push({ from: msg.from, text: shown, ts: msg.ts });
      } catch {
        this.feed.push({ from: msg.from, text: '[encrypted]', ts: msg.ts });
      }
    });

    // Für Konsole-Tests
    (window as any).socket = this.socket;
    (window as any).makeRoom = this.makeRoom.bind(this);
  }

  makeRoom(a: string, b: string) {
    return [a, b].sort().join('|');
  }

  async join() {
    this.feed = [];
    this.room = this.makeRoom(this.me, this.peer);
    this.socket.emit('room:join', this.room);
  
    // meinen PublicKey hochladen
    await fetch('http://localhost:4000/user/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.me, publicKey: this.crypto.me!.pub })
    });
  
    // Peer-Key holen (gerne mit dem kleinen Retry von vorhin)
    const r = await fetch(`http://localhost:4000/user/${encodeURIComponent(this.peer)}`);
    this.peerPub = r.ok ? (await r.json()).publicKey as string : undefined;
  
    // Verlauf laden + passend entschlüsseln
    const resp = await fetch(`http://localhost:4000/history/${encodeURIComponent(this.room)}`);
    const arr: any[] = await resp.json();
  
    const out = [];
    for (const m of arr) {
      let shown = m.text; // Fallback für ältere Nachrichten
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
  }

  async send() {
    const text = this.msg.trim();
    if (!text || !this.room || !this.peerPub) return;
  
    // zwei Cipher erzeugen
    const cipherTo   = await this.crypto.encryptFor(this.peerPub, text);
    const cipherFrom = await this.crypto.encryptFor(this.crypto.me!.pub, text);
  
    this.socket.emit('chat:send', {
      room: this.room,
      from: this.me,
      to: this.peer,
      cipherTo,
      cipherFrom,
      encrypted: true
    });
  
    this.msg = '';
  }
}
