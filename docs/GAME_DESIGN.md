# Game Design

SECRET RULES is a 4–10 player browser party game: everyone faces the same public
problem while each player follows a different private objective. Conversation,
selective truth and conflicting incentives create the comedy.

## The Button V2

The public objective is to land the Button counter on an exact target. Each turn:

1. privately select one real card from a five-card hand;
2. publicly claim any valid card identity;
3. choose a public target when the claim is SKIP, STEAL or INSPECT;
4. let opponents talk and decide whether to Call Bluff;
5. resolve the challenge and the real card on the authoritative server;
6. draw a replacement when the central deck still has cards.

The base game has five number cards (+1, +2, +3, -1, -2) and exactly six effect
cards (SKIP, STEAL, INSPECT, REVERSE, SHIELD, WILD). Every non-Wild effect also
moves the Button +1. Wild applies only its private chosen value. Positive
overshoots fail; negative movement floors at zero.

The first accepted challenge decides the result. Catching a bluff gains 1 while
the bluffer loses 1. A false accusation gives the truthful player 1 and costs
the challenger 1. Scores cannot fall below zero. The loser chooses one extra
private discard, permanently shrinking their hand for that round.

Reaching the target gives 2 points to the landing player and 1 to everyone else.
Players privately vote to end or continue; ties use a server coin flip. Continue
allows one final turn per active player while the counter remains secured.

## Secret Rules

Button V2 Secrets reward controllable bluffing, correct challenges, truthful
claims, negative/positive/effect use, distinct claims and social interactions.
Standard completion is worth 3; Hard completion is worth 5; failure is 0. Live
completion stays hidden until reveal. Generation accounts for player count,
expected turns, deck composition, difficulty, target relationships and recent
history.

## Match and presentation

Matches contain 3, 5, 7 or 10 fresh rounds. Each round resets hands, deck,
discard, Button, effects, private knowledge, vote and Secret. Match-local scores
persist until final standings. Returning to lobby resets the match while keeping
the social room.

The visual table is a physical oval with player seats outside its edge and
gameplay objects on the felt. Desktop emphasizes the whole table. Mobile
recomposes into roster, claim/challenge, counter/target and private hand instead
of shrinking the oval. The red Button remains a central physical identity while
acid lime remains the product accent.

The homepage demo is a scripted public example: face-down card, +2 claim, Call
Bluff, actual -2, caught bluff, score change and Secret tease. It is not connected
to multiplayer code.

No other mini-game, account, payment, matchmaking or persistent progression is
part of this implementation.
