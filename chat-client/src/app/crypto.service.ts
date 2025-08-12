import { Injectable } from '@angular/core';
import sodium from 'libsodium-wrappers-sumo';

export interface KeypairB64 {
  pub: string;
  priv: string;
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  ready = false;
  me?: KeypairB64;

  /**
   * Initialisiert libsodium und lädt/erzeugt ein Keypair.
   */
  async init() {
    if (!this.ready) {
      await sodium.ready;
      this.ready = true;
    }

    // Keypair aus localStorage laden oder neu erzeugen
    const cached = localStorage.getItem('kp');
    if (cached) {
      this.me = JSON.parse(cached);
    } else {
      const kp = sodium.crypto_box_keypair();
      this.me = {
        pub: sodium.to_base64(kp.publicKey),
        priv: sodium.to_base64(kp.privateKey),
      };
      localStorage.setItem('kp', JSON.stringify(this.me));
    }
  }

  /**
   * Verschlüsselt eine Nachricht für den Empfänger (sealed box).
   * @param peerPubB64 Public Key des Empfängers (Base64)
   * @param text Klartext
   * @returns Ciphertext (Base64)
   */
  async encryptFor(peerPubB64: string, text: string): Promise<string> {
    await this.init();
    const peer = sodium.from_base64(peerPubB64);
    const cipher = sodium.crypto_box_seal(new TextEncoder().encode(text), peer);
    return sodium.to_base64(cipher);
  }

  /**
   * Entschlüsselt eine Nachricht, die für mich verschlüsselt wurde (sealed box).
   * @param _peerPubB64 Public Key des Senders (bei sealed box nicht nötig)
   * @param cipherB64 Ciphertext (Base64)
   * @returns Klartext
   */
  async decryptFromMe(_peerPubB64: string, cipherB64: string): Promise<string> {
    await this.init();
    const pk = sodium.from_base64(this!.me!.pub);
    const sk = sodium.from_base64(this!.me!.priv);
    const cipher = sodium.from_base64(cipherB64);
    const plain = sodium.crypto_box_seal_open(cipher, pk, sk);
    return new TextDecoder().decode(plain);
  }
}
