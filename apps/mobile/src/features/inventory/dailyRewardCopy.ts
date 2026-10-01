import type { AppLocale } from "../session/appLocale"

export interface DailyRewardToastCopy {
  title: string
  body: string
}

/** The server-confirmed daily coin reward toast, in the app language (SYS-11). */
export function getDailyRewardToastCopy(
  locale: AppLocale,
  rewardCoins: number,
  onboardingCompleted: boolean
): DailyRewardToastCopy {
  if (locale === "tr") {
    return {
      title: `Günlük ödül: +${rewardCoins} coin`,
      body: onboardingCompleted
        ? "Bir sonraki vibe’ın için küçük bir hediye."
        : "İlk vibe’ın biraz ekstrayla başlıyor."
    }
  }
  return {
    title: `Daily reward: +${rewardCoins} coins`,
    body: onboardingCompleted
      ? "A little something for your next vibe."
      : "Your first vibe starts with a little extra."
  }
}
