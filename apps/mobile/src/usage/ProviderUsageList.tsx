import { ProviderUsageCard, ProviderUsageFooter } from '@openagentspocket/ui';
import type { ProviderCardModel, ProviderFooterModel } from './providerCards';

interface Props {
  cards: readonly ProviderCardModel[];
  footer: ProviderFooterModel | null;
  /** Opens a provider's detail on its Host. */
  onOpen?: (card: ProviderCardModel) => void;
}

/** The provider cards stacked, then the "Updated" footer: the body of every compact Usage surface. */
export function ProviderUsageList({ cards, footer, onOpen }: Props) {
  return (
    <>
      {cards.map((card) => (
        <ProviderUsageCard
          key={card.key}
          {...card.props}
          onPress={onOpen ? () => onOpen(card) : undefined}
          testID={`provider-card-${card.key}`}
        />
      ))}
      {footer ? <ProviderUsageFooter text={footer.text} status={footer.status} /> : null}
    </>
  );
}
