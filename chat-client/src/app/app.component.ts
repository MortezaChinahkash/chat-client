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

        let shown = msg.text;

        // Falls als verschlüsselt markiert, entschlüsseln
        if (msg.encrypted) {
          shown = await this.crypto.decryptFromMe('', msg.text);
        }

        this.feed.push({ from: msg.from, text: shown, ts: msg.ts });
      } catch (e) {
        // Falls Entschlüsselung fehlschlägt
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

    // 1) meinen PublicKey hochladen
    await fetch('http://localhost:4000/user/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.me, publicKey: this.crypto.me!.pub })
    });

    // 2) Peer-PublicKey holen
    const r = await fetch(`http://localhost:4000/user/${encodeURIComponent(this.peer)}`);
    this.peerPub = r.ok ? (await r.json()).publicKey as string : undefined;

    // 3) Verlauf laden (noch unverschlüsselt oder verschlüsselt, je nach Sender)
    const resp = await fetch(`http://localhost:4000/history/${encodeURIComponent(this.room)}`);
    const arr = await resp.json();
    this.feed = arr.map((m: any) => ({ from: m.from, text: m.text, ts: m.ts }));
  }

  async send() {
    const text = this.msg.trim();
    if (!text || !this.room || !this.peerPub) return;

    // Nachricht verschlüsseln
    const cipher = await this.crypto.encryptFor(this.peerPub, text);

    this.socket.emit('chat:send', {
      room: this.room,
      from: this.me,
      to: this.peer,
      text: cipher,
      encrypted: true
    });

    this.msg = '';
  }
}
