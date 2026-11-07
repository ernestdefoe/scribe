import Extend from 'flarum/common/extenders';
import ComposerSettings from './components/ComposerSettings';
import VideoSettings from './components/VideoSettings';

declare const m: any;

export default [
  new Extend.Admin().customSetting(function (this: any) {
    // `this` is the ExtensionPage, so the builder writes into the same stream
    // as every other setting and the page's own Save button persists it.
    return m(ComposerSettings, {
      toolbar: this.setting('ernestdefoe-scribe.toolbar'),
      toolbarPhone: this.setting('ernestdefoe-scribe.toolbar_phone'),
      slashMenu: this.setting('ernestdefoe-scribe.slash_menu', '1'),
    });
  }, 10),
  new Extend.Admin().customSetting(function (this: any) {
    return m(VideoSettings, {
      enabled: this.setting('ernestdefoe-scribe.video_embeds', '1'),
      off: this.setting('ernestdefoe-scribe.video_providers_off', '[]'),
    });
  }, 5),
];
