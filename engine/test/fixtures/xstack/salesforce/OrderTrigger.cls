// @conductor REQ-ORDER
trigger OrderTrigger on Order__c (before insert) {
    for (Order__c ord : Trigger.new) {
        if (ord.Status__c == null) {
            ord.Status__c = 'Draft';
        }
        if (ord.Total__c == null) {
            ord.Total__c = 0;
        }
    }
}
