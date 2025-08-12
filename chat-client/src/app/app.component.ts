import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { io, Socket } from 'socket.io-client'; // FIX: Import Socket type

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  socket!: Socket; // FIX: Now Socket type is imported

  constructor() {
    this.socket = io('http://localhost:4000', { transports: ['websocket'] });

    // Begrüßung (aus Schritt 2)
    this.socket.on('hello', (msg) => console.log('SERVER SAGT:', msg));

    // NEU: eingehende Chat-Nachrichten vom Server
    this.socket.on('chat:recv', (msg) => console.log('Empfangen:', msg));

    // Optional: fürs schnelle Testen in der Browser-Konsole
    (window as any).socket = this.socket;
  }
}
