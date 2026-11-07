import app from 'flarum/common/app';
import extractText from 'flarum/common/utils/extractText';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { joinDictation, speechLang } from '../dictation';

/** Why voice typing stopped, in the reader's language. */
const fail = (key: string) => extractText(app.translator.trans(`ernestdefoe-scribe.forum.voice.${key}`));

/** What is being heard but not yet settled, drawn at the cursor. */
const interimKey = new PluginKey<string>('scribeVoice');

/** Recogniser errors worth telling the person about, and what to tell them. */
const ERRORS: Record<string, string> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'unavailable',
  'audio-capture': 'no_microphone',
  network: 'network',
  'language-not-supported': 'language',
};

/**
 * Voice typing with the browser's own recogniser (the Web Speech API).
 *
 * The toolbar's microphone calls `toggle()` from this extension's storage and
 * reads `listening` for its pressed state. While listening, what is being
 * heard shows greyed at the cursor and goes in as text once the recogniser
 * settles on it. A second tap, or leaving the editor, stops it; whatever was
 * still being heard is kept rather than lost.
 *
 * 🚨 This is the browser's recogniser, not ours: Safari sends the audio to
 * Apple and Chrome to Google, which the AdminCP says beside the button. No
 * audio passes through the forum. Firefox has no recogniser, so it gets no
 * button (speechSupported() in toolbarButtons).
 *
 * 🚨 Android Chrome ends a session after every phrase even when asked to keep
 * listening, so an end the person did not ask for starts a new one — but only
 * while it keeps hearing something, so a forgotten microphone switches itself
 * off instead of listening forever.
 */
export const ScribeVoice = Extension.create({
  name: 'scribeVoice',

  addStorage() {
    return { listening: false, error: '', toggle: () => {}, stop: () => {}, abort: () => {} };
  },

  onCreate() {
    const editor = this.editor;
    const storage = this.storage as { listening: boolean; error: string; toggle: () => void; stop: () => void; abort: () => void };
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    let recognition: any = null;
    let wanted = false;
    let settled = 0;
    let interim = '';
    let heard = false;
    let quiet = 0;
    let blurTimer = 0;
    const locale = app.translator.getLocale() || 'en';

    const show = (text: string) => {
      interim = text;
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(interimKey, text).setMeta('addToHistory', false));
    };

    const insert = (phrase: string) => {
      if (editor.isDestroyed) return;
      const { state } = editor;
      const { $from } = state.selection;
      const text = joinDictation($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'), phrase, locale);
      if (text) editor.view.dispatch(state.tr.insertText(text).scrollIntoView());
      heard = true;
    };

    const finish = () => {
      wanted = false;
      recognition = null;
      storage.listening = false;
      show('');
    };

    const listen = () => {
      const r = new Recognition();
      recognition = r;
      settled = 0;
      r.lang = speechLang(locale, navigator.languages?.length ? navigator.languages : [navigator.language]);
      r.continuous = true;
      r.interimResults = true;

      r.onresult = (event: any) => {
        let pending = '';
        for (let i = settled; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && i === settled) {
            insert(result[0].transcript);
            settled++;
          } else {
            pending += result[0].transcript;
          }
        }
        show(pending);
      };

      r.onerror = (event: any) => {
        const message = ERRORS[event.error];
        if (!message) return; // no-speech, aborted: onend decides
        /*
         * 🚨 Stop here, not in onend: Safari reports `not-allowed` and then
         * never ends the session, so the microphone stayed red forever.
         * The reason goes under the toolbar, not into a Flarum alert, which
         * slides in at the bottom of a phone screen — under the keyboard.
         */
        storage.error = fail(message);
        interim = '';
        finish();
        try {
          r.abort();
        } catch (e) {
          // Already over.
        }
      };

      r.onend = () => {
        if (recognition !== r) return;
        // Words still being heard when it stopped are words the person said.
        if (interim) insert(interim);
        show('');

        quiet = heard ? 0 : quiet + 1;
        heard = false;
        if (wanted && quiet < 2) {
          try {
            listen();
            return;
          } catch (e) {
            // Fall through: the browser would not start again.
          }
        }
        finish();
      };

      r.start();
    };

    storage.stop = () => {
      if (!recognition) return finish();
      wanted = false;
      // stop(), not abort(): the recogniser settles what it heard, then ends.
      recognition.stop();
    };

    storage.toggle = () => {
      if (storage.listening) {
        // Back to writing: the caret, not the microphone, has focus.
        editor.commands.focus();
        return storage.stop();
      }
      if (!Recognition) return;

      wanted = true;
      storage.error = '';
      heard = false;
      quiet = 0;
      storage.listening = true;
      editor.commands.focus();

      try {
        listen();
      } catch (e) {
        storage.error = fail('failed');
        finish();
        return;
      }
      show('');
    };

    /*
     * Leaving the editor stops listening. Not at once: tapping a toolbar
     * button (the microphone itself, or Bold while dictating) takes focus
     * first and hands it back a moment later.
     */
    editor.on('blur', () => {
      clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!storage.listening || editor.isDestroyed || editor.isFocused) return;
        const host = editor.view.dom.closest('.TextEditor');
        if (host && host.contains(document.activeElement)) return;
        storage.stop();
      }, 300);
    });

    // The composer closed: drop everything, settle nothing.
    storage.abort = () => {
      clearTimeout(blurTimer);
      wanted = false;
      const r = recognition;
      recognition = null;
      storage.listening = false;
      r?.abort();
    };
  },

  onDestroy() {
    (this.storage as any).abort();
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<string>({
        key: interimKey,
        state: {
          init: () => '',
          apply: (tr, value) => {
            const next = tr.getMeta(interimKey);
            return next === undefined ? value : next;
          },
        },
        props: {
          decorations(state) {
            const text = interimKey.getState(state);
            if (!text) return null;
            const widget = Decoration.widget(
              state.selection.head,
              () => {
                const span = document.createElement('span');
                span.className = 'Scribe-interim';
                span.textContent = text;
                return span;
              },
              { side: 1, key: 'interim:' + text }
            );
            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
