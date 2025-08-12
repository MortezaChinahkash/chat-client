import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { io, Socket } from 'socket.io-client';

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

  constructor() {
    // Verbindung zum Server
    this.socket = io('http://localhost:4000', { transports: ['websocket'] });

    // Begrüßung (Test)
    this.socket.on('hello', (msg) => console.log('SERVER SAGT:', msg));

    // Eingehende Nachrichten live verarbeiten
    this.socket.on('chat:recv', (msg) => {
      console.log('Empfangen:', msg);
      if (msg.room === this.room) {
        this.feed = [...this.feed, { from: msg.from, text: msg.text, ts: msg.ts }];
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
    this.feed = []; // alten Verlauf leeren
    this.room = this.makeRoom(this.me, this.peer);
    this.socket.emit('room:join', this.room);

    // Verlauf vom Server holen
    try {
      const resp = await fetch(`http://localhost:4000/history/${encodeURIComponent(this.room)}`);
      const arr = await resp.json();
      this.feed = arr.map((m: any) => ({ from: m.from, text: m.text, ts: m.ts }));
    } catch (err) {
      console.error('Fehler beim Laden des Verlaufs:', err);
      this.feed = [];
    }
  }

  send() {
    const text = this.msg.trim();
    if (!text || !this.room) return;
    this.socket.emit('chat:send', {
      room: this.room,
      from: this.me,
      to: this.peer,
      text,
      ts: Date.now(),
    });
    this.feed = [...this.feed, { from: this.me, text, ts: Date.now() }];
    this.msg = '';
  }
}
