/**
 * @fileoverview Help guide panel component.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {css, html, LitElement, svg} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('help-guide-panel')
export class HelpGuidePanel extends LitElement {
  @property({type: Boolean, reflect: true}) isOpen = false;

  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      width: 100%;
      height: 100%;
      z-index: 1050; 
      pointer-events: none; 
      transition: background-color 0.3s ease-in-out;
    }
    :host([isOpen]) {
      pointer-events: auto; 
      background-color: rgba(0, 0, 0, 0.5); 
    }
    .panel {
      position: absolute;
      top: 0;
      right: 0;
      width: clamp(300px, 40vw, 500px); 
      height: 100%;
      background-color: #282828; 
      color: #e0e0e0;
      box-shadow: -5px 0 15px rgba(0,0,0,0.3);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    :host([isOpen]) .panel {
      transform: translateX(0);
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background-color: #333;
      border-bottom: 1px solid #444;
      flex-shrink: 0;
    }
    .panel-header h2 {
      margin: 0;
      font-size: 1.4em;
      font-weight: 500;
    }
    .close-button {
      background: none;
      border: none;
      color: #e0e0e0;
      font-size: 1.8em;
      font-weight: bold;
      cursor: pointer;
      padding: 0 5px;
      line-height: 1;
    }
    .close-button:hover {
      color: #fff;
    }
    .panel-content {
      padding: 20px;
      overflow-y: auto;
      flex-grow: 1;
      scrollbar-width: thin;
      scrollbar-color: #555 #282828;
    }
    .panel-content::-webkit-scrollbar { width: 8px; }
    .panel-content::-webkit-scrollbar-track { background: #282828; }
    .panel-content::-webkit-scrollbar-thumb { background-color: #555; border-radius: 4px; }
    
    .panel-content h3 {
      color: #fff;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 500;
      border-bottom: 1px solid #444;
      padding-bottom: 0.3em;
    }
    .panel-content h3:first-child {
      margin-top: 0;
    }
    .panel-content h4 {
      color: #ddd;
      margin-top: 1em;
      margin-bottom: 0.3em;
      font-weight: 500;
    }
    .panel-content p, .panel-content ul {
      line-height: 1.6;
      margin-bottom: 0.8em;
    }
    .panel-content ul {
      padding-left: 20px;
    }
    .panel-content li {
      margin-bottom: 0.5em;
    }
    .panel-content strong {
      color: #fff;
      font-weight: 600;
    }
    .panel-content code {
      background-color: #1e1e1e;
      padding: 0.1em 0.4em;
      border-radius: 3px;
      font-family: monospace;
    }
  `;

  private _close() {
    this.dispatchEvent(new CustomEvent('close-help', {bubbles: true, composed: true}));
  }

  override render() {
    return html`
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="help-panel-title" ?hidden=${!this.isOpen}>
        <div class="panel-header">
          <h2 id="help-panel-title">Steppa's BeatLab Help</h2>
          <button class="close-button" @click=${this._close} aria-label="Close help panel">✕</button>
        </div>
        <div class="panel-content">
          <section>
            <h3>Willkommen bei Steppa's BeatLab!</h3>
            <p>Diese App ermöglicht es dir, interaktiv Musik in Echtzeit mit Text-Prompts und MIDI-Controllern zu gestalten.</p>
          </section>
          <section>
            <h3>Grundlagen</h3>
            <h4>Tracks hinzufügen</h4>
            <p>Klicke auf den großen <strong>+ Button</strong> unterhalb deiner aktuellen Track-Liste, um einen neuen Track (Prompt-Zeile) hinzuzufügen.</p>
            <h4>Prompts schreiben</h4>
            <p>Klicke auf den Text (z.B. "Ambient Chill" oder "New Prompt") eines Tracks oder den Bearbeiten-Button (Stift-Icon) daneben, um deinen eigenen Musik-Prompt einzugeben. Drücke <strong>Enter</strong> oder klicke den Speichern-Button (Haken-Icon), um zu speichern. Die Musik-Engine versucht dann, diesen Prompt umzusetzen.</p>
            <h4>Gewichtung anpassen (Ratio)</h4>
            <p>Ziehe den farbigen Slider unter jedem Prompt, um dessen Einfluss (Gewichtung) auf die generierte Musik anzupassen. Werte reichen von 0 (kein Einfluss) bis 2 (starker Einfluss). Die aktuelle Ratio wird rechts neben dem Prompt-Text angezeigt. Dies ist auch per MIDI CC steuerbar (siehe MIDI-Sektion).</p>
            <h4>Musik starten/pausieren</h4>
            <p>Verwende den großen <strong>Play/Pause-Button (▶️/⏸️ unten links)</strong>. Beim ersten Start oder nach einer Unterbrechung kann es einen Moment dauern (Lade-Symbol), bis die Musik beginnt. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>"Drop!"-Effekt</h4>
            <p>Klicke den <strong>Drop!-Button ( unten rechts)</strong> für einen dynamischen Effekt! Die Musik baut Spannung auf und entlädt sich dann. Der Stil des Drops (z.B. intensiv, sanft, groovig) passt sich nun automatisch an die aktuell gespielte Musik an, um Übergänge natürlicher und wirkungsvoller zu gestalten. Auch dieser Button ist per MIDI CC steuerbar.</p>
            <h4>Cast-Funktion (Audio streamen)</h4>
            <p>Klicke auf das <strong>Cast-Icon (oben rechts)</strong>, um die Audioausgabe an ein Google Cast-fähiges Gerät (z.B. Chromecast, Google Home Lautsprecher) zu streamen. Die Audio-Chunks werden an einen Webservice gesendet, der einen kontinuierlichen Stream für das Cast-Gerät bereitstellt. Wenn die Verbindung aktiv ist, wird das Icon blau. Klicke erneut, um das Casting zu beenden. Während des Castings wird der Ton lokal stummgeschaltet.</p>
            <p><strong>Wichtig:</strong> Die Audioausgabe an das Cast-Gerät startet erst, nachdem die ersten Audio-Daten an den Webservice gesendet wurden. Dies kann zu einer kurzen Verzögerung führen. Die Qualität und Stabilität des Audio-Castings hängt von deiner Netzwerkverbindung, dem Cast-Gerät und dem Webservice (aktuell unter <code>https://chunkstreamer.onrender.com</code>) ab. Bei Problemen ("Failed to fetch"), prüfe die Browser-Konsole auf CORS- oder Mixed-Content-Fehler.</p>
            <p>Wenn eine neue Cast-Sitzung gestartet wird, wird der Server angewiesen, alle alten Audiodaten zu verwerfen und einen neuen Stream zu beginnen. Dies stellt sicher, dass du immer die aktuelle Live-Generierung hörst.</p>
          </section>
          <section>
            <h3>Konfiguration Teilen (via Link)</h3>
            <p>Klicke auf den <strong>Share-Button</strong> unten rechts. Dadurch wird ein spezieller Link in deine Zwischenablage kopiert.</p>
            <p>Wenn jemand diesen Link öffnet, startet Steppa's BeatLab automatisch mit genau deiner aktuellen Konfiguration (Prompts, Gewichtungen, und alle erweiterten Einstellungen) <strong>und beginnt mit der Wiedergabe</strong>.</p>
            <p>Ideal, um deine Kreationen schnell und einfach zu präsentieren oder gemeinsam an Klanglandschaften zu arbeiten!</p>
          </section>
          <section>
            <h3>Erweiterte Einstellungen (Zahnrad-Icon)</h3>
            <p>Klicke auf das Zahnrad-Icon (⚙️) in der oberen rechten Leiste, um die erweiterten Einstellungen ein- oder auszublenden.</p>
            <ul>
              <li><strong>Temperature:</strong> Regelt die Zufälligkeit. Höher = mehr Variation.</li>
            </ul>
            <p>Andere Parameter wie Guidance, BPM, Density, Brightness, Mute-Optionen und der Music Generation Mode können über geteilte Links oder geladene Presets beeinflusst werden, sind aber nicht direkt in der UI einstellbar.</p>
          </section>
           <section>
            <h3>MIDI-Steuerung & Learn-Funktion</h3>
            <p>Wähle dein MIDI-Gerät aus dem Dropdown-Menü oben links aus. Wenn kein Gerät erscheint, stelle sicher, dass es verbunden ist und dein Browser Zugriff auf MIDI-Geräte hat. Sobald ein Gerät ausgewählt ist, erscheint der <strong>"Learn MIDI"</strong>-Button.</p>
            <h4>MIDI Learn Modus:</h4>
            <ol>
              <li>Klicke auf <strong>"Learn MIDI"</strong>. Der Button-Text ändert sich zu "Learning... (Cancel)" und eine Anleitung erscheint über den Tracks.</li>
              <li>Klicke nun auf das Element, das du per MIDI steuern möchtest:
                <ul>
                  <li>Einen <strong>Track-Slider</strong> (die farbige Leiste unter einem Prompt).</li>
                  <li>Den <strong>"Drop!"-Button</strong>.</li>
                  <li>Den <strong>Play/Pause-Button</strong>.</li>
                </ul>
                Das ausgewählte Element wird golden hervorgehoben.
              </li>
              <li>Bewege nun einen Regler/Fader oder drücke einen Button/Pad an deinem MIDI-Gerät.</li>
              <li>Die App weist diese MIDI CC-Nummer dem ausgewählten Element zu. Eine Bestätigung (Toast-Nachricht) erscheint.</li>
              <li>Du kannst direkt weitere Zuweisungen vornehmen, indem du erneut ein Element und dann einen MIDI-Controller auswählst/bewegst.</li>
              <li>Klicke erneut auf "Learning... (Cancel)" oder drücke die <strong>Escape</strong>-Taste, um den Lernmodus zu beenden. (Escape bricht bei ausgewählten Ziel erst die Zielauswahl ab, dann den Modus).</li>
            </ol>
            <h4>Funktionsweise der zugewiesenen MIDI-Controller:</h4>
            <ul>
              <li><strong>Track-Slider:</strong> Der MIDI CC-Wert (0-127) steuert die Gewichtung des Tracks (skaliert auf 0-2).</li>
              <li><strong>Drop!-Button / Play/Pause-Button:</strong> Ein MIDI CC-Wert <strong>größer als 64</strong> löst die Aktion aus (simuliert einen Knopfdruck).</li>
            </ul>
            <h4>MIDI-Zuweisungen löschen:</h4>
            <ul>
              <li>Alle Zuweisungen werden automatisch gelöscht, wenn du ein anderes MIDI-Gerät auswählst oder die Auswahl aufhebst.</li>
              <li>Um alle Zuweisungen manuell zu löschen: Drücke und halte den <strong>"Learn MIDI"</strong>-Button (wenn der Lernmodus <em>nicht</em> aktiv ist) für ca. 2 Sekunden, bis eine Bestätigung erscheint.</li>
            </ul>
            <p><strong>Wichtig:</strong> Während eine "Drop!"-Sequenz aktiv ist, ist die MIDI-Steuerung (und das Ändern von Einstellungen) temporär deaktiviert.</p>
          </section>
          <section>
            <h3>Tracks verwalten</h3>
            <h4>Prompts bearbeiten</h4>
            <p>Klicke auf den Text des Prompts (oder den Stift-Button), bearbeite ihn und drücke <strong>Enter</strong> (oder klicke den Haken-Button).</p>
            <h4>Tracks entfernen</h4>
            <p>Klicke auf das rote <strong>✕</strong>-Symbol rechts neben einem Track, um ihn zu entfernen.</p>
          </section>
          <section>
            <h3>Inspirations-Ecke: Was kannst du Cooles machen?</h3>
            <ul>
              <li><strong>Ambient-Klangwelten:</strong> Erzeuge beruhigende Ambient-Klanglandschaften für Meditation oder Fokus. Nutze Prompts wie <code>tiefer Weltraumklang, langsame Synthesizer-Pads, ferne Chöre</code> und halte die Temperatur niedrig (z.B. 0.5-0.8) für subtile Entwicklungen.</li>
              <li><strong>Dynamische Live-Sets:</strong> Mixe verschiedene Musikstile live! Starte mit einem <code>Deep House Beat mit 120 BPM</code>, füge dann einen Track mit <code>funky analog Bassline</code> hinzu und überblende später zu <code>energetischer Trance-Melodie mit treibenden Arpeggios</code>. Nutze die Gewichts-Slider (Ratio) und einen MIDI-Controller für fließende Übergänge. Nutze den <strong>Drop!</strong>-Button für dramatische Höhepunkte!</li>
              <li><strong>Kreative Sound-Experimente:</strong> Entdecke verrückte und einzigartige Sounds! Probiere ungewöhnliche Prompts wie <code>singende Roboter im Dschungel bei Gewitter</code>, <code>gläserne Regentropfen auf einer alten Holztür</code> oder <code>flüsternde Alien-Stimmen in einer Höhle</code>. Spiele mit hoher Temperatur (z.B. 1.2-1.8) für überraschende und unvorhersehbare Ergebnisse.</li>
              <li><strong>Storytelling mit Musik:</strong> Untermale eine Geschichte, ein Hörspiel oder ein Rollenspiel live mit passender Musik. Ändere die Prompts dynamisch, um die Stimmung der jeweiligen Szene widerzuspiegeln – von <code>spannungsgeladener Verfolgungsmusik mit schnellen Drums</code> bis zu <code>friedlicher Melodie bei Sonnenaufgang mit sanften Streichern</code>.</li>
              <li><strong>Interaktive Jam-Session mit der KI:</strong> Verwende einen MIDI-Keyboard-Controller, um die Gewichte der Tracks wie Instrumente in einer Band zu 'spielen'. Erstelle einen Basis-Groove mit einem Prompt und improvisiere dann Melodien, Harmonien oder Stimmungsänderungen, indem du andere Prompts über die Slider (oder MIDI CCs) ein- und ausblendest.</li>
              <li><strong>Genre-Mashups:</strong> Kombiniere gegensätzliche Genres! Was passiert, wenn du <code>Barockes Cembalo-Solo</code> mit <code>Heavy Dubstep Wobble Bass</code> mischst? Sei mutig und finde neue Klangkombinationen.</li>
            </ul>
          </section>
          <section>
            <h3>Tipps & Fehlerbehebung</h3>
            <h4>"No MIDI Devices" / MIDI-Gerät nicht erkannt</h4>
            <p>Stelle sicher, dass dein MIDI-Gerät korrekt angeschlossen und eingeschaltet ist, bevor du die Seite lädst. Manchmal hilft es, die Seite neu zu laden, nachdem das Gerät verbunden wurde. Überprüfe auch die Browser-Berechtigungen für MIDI.</p>
            <h4>Ladeanzeige / Musik startet nicht sofort</h4>
            <p>Es kann einen Moment dauern, bis die Verbindung zur Musik-Engine hergestellt und genügend Audio-Daten für eine stabile Wiedergabe gepuffert wurden.</p>
            <h4>Verbindungsfehler / Musik stoppt</h4>
            <p>Es kann zu Netzwerkproblemen oder serverseitigen Unterbrechungen kommen. Versuche, die Wiedergabe über den Play/Pause-Button neu zu starten. Eine Fehlermeldung gibt oft genauere Hinweise.</p>
            <h4>"Filtered Prompt" Nachricht</h4>
            <p>Manchmal werden Prompts aus Sicherheitsgründen oder aufgrund von Inhaltsrichtlinien gefiltert und nicht zur Musikgenerierung verwendet. In diesem Fall wird der entsprechende Prompt markiert und eine Nachricht angezeigt.</p>
             <h4>Geteilter Link funktioniert nicht richtig</h4>
            <p>Stelle sicher, dass der Link vollständig kopiert wurde. Sehr lange oder komplexe Prompts könnten in seltenen Fällen die maximale URL-Länge überschreiten, obwohl dies unwahrscheinlich ist.</p>
          </section>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'help-guide-panel': HelpGuidePanel;
  }
}
