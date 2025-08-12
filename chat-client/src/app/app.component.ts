import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { io } from 'socket.io-client';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    const socket = io('http://localhost:4000', { transports: ['websocket'] });
    socket.on('hello', (msg) => console.log('SERVER SAGT:', msg));
  }
}
