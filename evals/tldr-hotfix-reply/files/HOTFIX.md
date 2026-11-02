# Android crash in release 4.12: what I found and what I suggest

Hi, and thanks for looping me in on this one. It was a really interesting problem to dig into, and I learned a lot about how our image pipeline works along the way. I want to give you the full picture, because I think the background helps a lot when you look at the options. I will start with some background, then go through what happened and what I looked at, then the options, and at the end the things that I could not check.

## Background

Release 4.12 of the Android app went out on Monday as a staged rollout. The rollout is at 20% of our Android users right now. The release has the new one-page checkout, which the marketing team plans to announce in the newsletter on Thursday, and a few smaller fixes. It also upgrades our image library, Glimmer, from version 3.2 to version 3.4.

We upgraded Glimmer mainly because 3.4 decodes WebP images with much less memory. In our tests on tablets, that cut the out-of-memory crashes by about 30%, which was one of the top complaints in the store reviews last quarter.

We have used Glimmer for about three years now. It has generally been reliable, and the vendor has always been responsive, so this kind of problem is unusual for it. I mention this because I do not think that we need to question the choice of the library itself.

## What happened

On Tuesday morning, the crash dashboard showed that the crash-free session rate of 4.12 had dropped to 97.1%. Release 4.11 was at 99.6%. Our release gate is 99.0%, so 4.12 is clearly below the gate. Almost all of the new crashes have the same stack trace: a NullPointerException inside the disk cache of Glimmer, when the app opens the product list.

## What I looked at

First, I grouped the crashes by device. 96% of the new crashes come from devices with Android 9 or older. These devices are about 8% of our Android users. Then I read through the changelog of Glimmer 3.4, and I found that it changed the way it opens its disk cache on older Android versions. That matches the stack trace quite well.

Second, I tried to reproduce the crash. On an Android 9 emulator, the app crashes on the first start after an update from 4.11 to 4.12, when the old cache from Glimmer 3.2 is still on the device. A fresh install of 4.12 does not crash. So the trigger seems to be the old cache folder, not Glimmer 3.4 on its own. I did not have a real Android 9 device, so I could only test this on the emulator.

Third, I looked at the rest of the crashes, the 4% that do not come from Android 9 or older. Most of them look like the normal background noise that we see in each release. But Tomás from QA has one crash report from an Android 11 device with the same stack trace, and Tomás doubts that the problem is limited to Android 9 and older. I tried to reproduce it on an Android 11 emulator and could not. I think that the report more likely comes from a device with a modified system, but I cannot rule it out. I want to be honest that this is my reading of one report, not a fact.

Fourth, I asked the Glimmer vendor. Their support engineer, Ines, answered within an hour, which was great. Ines said that the vendor knows the bug and that their beta version 3.4.1 fixes it. Ines is fairly sure about this, but 3.4.1 is a beta, it is not on their public release channel yet, and nobody on our side has tested it.

## The options

The first thing to decide is whether to halt the staged rollout now. If we halt it, no new users get 4.12. But the users who already have 4.12, the 20% from above, keep the crash until a fixed version reaches them. Halting the rollout also means that the new checkout does not reach more users before the newsletter on Thursday. Marketing would then have to move the announcement, or announce a feature that 80% of our users do not have yet. I recommend that we halt the rollout, but this affects marketing, so I need your approval.

For the fix itself, I see two options.

Option A is to pin Glimmer back to 3.2 in a hotfix release, 4.12.1. This is the safest option. We know that 3.2 works, and the change is one line in the build file plus a test run, so I estimate about one day of work. The cost is that we lose the WebP memory improvement. The out-of-memory crashes on tablets then come back to the level of 4.11 until we upgrade again.

Option B is to move to the Glimmer beta 3.4.1 in 4.12.1. This keeps the memory improvement. But it rests on the claim of the vendor that the beta fixes the bug, and we would ship a beta library to all of our users. We would also need about two days to test it properly, including on a real Android 9 device, which we would have to borrow or buy.

I lean slightly toward Option A, because it removes the crash with less risk, and we can move to 3.4.1 when it becomes a stable release. But Option B is reasonable too, if the memory problem on tablets matters more to you.

There is one thing that the hotfix must do with Option A. The users of 4.12 now have a disk cache in the format of Glimmer 3.4. If 4.12.1 goes back to 3.2, Glimmer 3.2 cannot read that cache, and the app crashes on start for each user who updates from 4.12, on all Android versions. To prevent this, the hotfix must change the cache version key in `ImageConfig.kt` from 7 to 8, so that the app deletes the old cache on its first start. The cost is one extra download of the cached images, about 40 MB for each user, which some users will notice on mobile data. With Option B, Ines says that the key change is not needed, but I would still make it.

The Google Play review usually takes a few hours, but it can take up to 48 hours. The Black Friday sale starts on 27 November, and we want the fix to reach users before the sale traffic starts. So the hotfix must be submitted to Google Play by 24 November at the latest. With Option A, that is easy. With Option B, it is tight but possible.

## What I did not check

I did not test on a real Android 9 device. All of my tests ran on emulators.

I did not check the iOS app in detail. It uses a different image library, so I do not expect the same crash there, but I only looked at the crash dashboard for iOS, which looks normal.

I did not test Glimmer 3.4.1 at all.

## Summary

To sum up everything above: 4.12 crashes for users on Android 9 and older after the update from 4.11, because of the disk cache of Glimmer 3.4. I recommend that we halt the rollout, ship 4.12.1 with Glimmer pinned to 3.2 and the cache key changed to 8, and submit it by 24 November. I need you to approve the halt of the rollout and to pick between Option A and Option B. Tomás doubts the Android 9 limit, and the fix of the vendor in 3.4.1 is untested.

Let me know if you want me to prepare the hotfix branch, write the message to the marketing team, or set up a test on a real device. Happy to help with any of this!
