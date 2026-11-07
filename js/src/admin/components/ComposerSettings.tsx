import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Switch from 'flarum/common/components/Switch';
import ToolbarBuilder from './ToolbarBuilder';
import { DEFAULT_TOOLBAR } from '../../common/toolbarButtons';

const t = (k: string) => app.translator.trans('ernestdefoe-scribe.admin.' + k);

type Stream = (value?: string) => string;

export interface ComposerSettingsAttrs {
  toolbar: Stream;
  toolbarPhone: Stream;
  slashMenu: Stream;
}

/** A switch setting stored as "1"/"0" (or a boolean, before the first save). */
const isOn = (raw: any) => !(raw === '0' || raw === '' || raw === false || raw === 0);

/**
 * The toolbar, the optional phone toolbar, and the `/` menu that offers the
 * same features. Every stream is the ExtensionPage's own, so its Save button
 * persists all of it.
 */
export default class ComposerSettings extends Component<ComposerSettingsAttrs> {
  desktopKeys(): string[] {
    try {
      const parsed = JSON.parse(this.attrs.toolbar() || 'null');
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {
      // Fall through to the defaults, as the builder does.
    }
    return [...DEFAULT_TOOLBAR];
  }

  view() {
    const phone = !!this.attrs.toolbarPhone();
    const slash = isOn(this.attrs.slashMenu() ?? '1');

    return (
      <div className="ScribeComposerSettings">
        <ToolbarBuilder setting={this.attrs.toolbar} />
        <div className="helpText ScribeComposerSettings-voice">{t('voice_help')}</div>

        <div className="Form-group">
          {Switch.component(
            {
              state: phone,
              // Starting from the desktop arrangement: most phone toolbars are it, minus a few.
              onchange: (value: boolean) => this.attrs.toolbarPhone(value ? JSON.stringify(this.desktopKeys()) : ''),
            },
            t('phone_toolbar_switch')
          )}
          <div className="helpText">{t('phone_toolbar_help')}</div>
        </div>

        {phone && (
          <ToolbarBuilder
            setting={this.attrs.toolbarPhone}
            label={t('phone_toolbar_label') as string}
            help={t('phone_toolbar_builder_help') as string}
            defaults={() => this.desktopKeys()}
          />
        )}

        <div className="Form-group">
          {Switch.component({ state: slash, onchange: (value: boolean) => this.attrs.slashMenu(value ? '1' : '0') }, t('slash_switch'))}
          <div className="helpText">{t('slash_help')}</div>
        </div>
      </div>
    );
  }
}
