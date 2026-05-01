# FEATURES

## Global

[x] The messging for capacity is not correct in AI CHAT and INFOCARE ANALYTICS. We need to be careful about how we communicate this as some children are only enrolled as parttime and max capacity is for fulltime. Check to see if you can find a method for calculating part time enrolments and aggregate to fulltime equivalent

## Infocare Analytics

[x] Change the table heading text from "ENROLLED / CAPACITY" to "ENROL/MAX" - ensure to remove the spaces
[x] The filters for 1W, 2W, 3W, etc should update

- the table data
- the AI CHAT
- Need a method of capturng centre data and storing it for use for this filter function
- would session store work or would that be too expensive? If expensive then save to DB

[x] Make the entire row clickable - same function as the "SERVICE" cells hyperlinks

## AI CHAT

[x] Remove the messaging for "remains ordered by hierarchy rather than by an exposed score column." as redundant. Keep this in memory for this app as you seem to be injecting this into the design despite me insisting that hierarchy is implied to the user and not implicit
[x] The messaging eg. "50 children are currently enrolled against a licensed capacity of 45." is disingenous, as mentioned earlier in Global and is uneccesary
[x] Keep the messaging succinct by finding opportunities to communicate good information for a user to know (this is the point of this app and you should add this concept to the apps design) and not be filled with numerical facts but instead written as an informal guide. We will work on this feature more later when we pipe in AI functionality but if you can create a series of example reposnses to use like, but not limited to, the following:

- "...have room for new enrolments with 5 spaces available"
- "...and with a healthy waitlist they should begin contacting those families now"

[x] We should begin collecting a daily snapshot of all centres and store in db or log so we can make queries to later with the AI CHAT panel
