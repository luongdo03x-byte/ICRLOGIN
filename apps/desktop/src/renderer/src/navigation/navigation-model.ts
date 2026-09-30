export type AppSection = 'profiles' | 'groups' | 'proxy' | 'browsers' | 'extensions' | 'settings';
export type SectionView = 'profiles' | 'groups' | 'proxy' | 'browsers' | 'extensions' | 'placeholder:settings';

export function getSectionView(section: AppSection): SectionView {
  switch (section) {
    case 'profiles': return 'profiles';
    case 'groups': return 'groups';
    case 'proxy': return 'proxy';
    case 'browsers': return 'browsers';
    case 'extensions': return 'extensions';
    case 'settings': return 'placeholder:settings';
  }
}
