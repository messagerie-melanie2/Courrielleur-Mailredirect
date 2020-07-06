// based on http://dxr.mozilla.org/comm-central/source/mail/components/compose/content/addressingWidgetOverlay.js

"use strict";

Components.utils.import("resource://gre/modules/Services.jsm"); // Gecko 2+ (TB3.3)
Components.utils.import("resource:///modules/mailServices.js"); // Gecko 5+ (TB5)

top.MAX_RECIPIENTS = 1; /* for the initial listitem created in the XUL */

var inputElementType = "";
var selectElementType = "";
var selectElementIndexTable = null;

var gNumberOfCols = 0;

var gDragService = Cc["@mozilla.org/widget/dragservice;1"].
                   getService(Ci.nsIDragService);

function awGetMaxRecipients()
{
  return top.MAX_RECIPIENTS;
}

function awGetNumberOfCols()
{
  if (gNumberOfCols === 0) {
    var listbox = document.getElementById("addressingWidget");
    var listCols = listbox.getElementsByTagName("listcol");
    gNumberOfCols = listCols.length;
    if (!gNumberOfCols)
      gNumberOfCols = 1;  /* if no cols defined, that means we have only one! */
  }

  return gNumberOfCols;
}

/**
 * Adjust the default and minimum number of visible recipient rows for addressingWidget
 */
function awInitializeNumberOfRowsShown()
{
  let headerToolbar = document.getElementById("MsgHeadersToolbar");
  let addressingWidget = document.getElementById("addressingWidget");
  let awNumRowsShownDefault =
    Services.prefs.getIntPref("extensions.mailredirect.addresswidget.numRowsShownDefault");

  // Work around bug 966655: extraHeight 2 pixels for msgHeadersToolbar ensures
  // visibility of recipient rows per awNumRowsShownDefault and prevents scrollbar
  // on empty Address Widget, depending on OS screen resolution dpi scaling
  // (> 100%; thresholds differ).
  let extraHeight = 2;

  // Set minimum number of rows shown for address widget, per hardwired
  // rows="1" attribute of addressingWidget, to prevent resizing the
  // subject and format toolbar over the address widget.
  // This lets users shrink the address widget to one row (with delicate UX)
  // and thus maximize the space available for composition body,
  // especially on small screens.
  headerToolbar.minHeight = headerToolbar.boxObject.height;

  // Set default number of rows shown for address widget.
  addressingWidget.setAttribute("rows", awNumRowsShownDefault);
  headerToolbar.height = headerToolbar.boxObject.height + extraHeight;

  // Update addressingWidget internals.
  awCreateOrRemoveDummyRows();
}

function awInputElementName()
{
  if (inputElementType === "")
    inputElementType = document.getElementById("addressCol2#1").localName;
  return inputElementType;
}

function awSelectElementName()
{
  if (selectElementType === "")
    selectElementType = document.getElementById("addressCol1#1").localName;
  return selectElementType;
}

// TODO: replace awGetSelectItemIndex with recipient type index constants

function awGetSelectItemIndex(itemData)
{
  if (selectElementIndexTable === null) {
    selectElementIndexTable = new Object();
    var selectElem = document.getElementById("addressCol1#1");
    for (var i = 0; i < selectElem.childNodes[0].childNodes.length; i++)
    {
      var aData = selectElem.childNodes[0].childNodes[i].getAttribute("value");
      selectElementIndexTable[aData] = i;
    }
  }

  return selectElementIndexTable[itemData];
}

function Recipients2CompFields(msgCompFields)
{
  if (msgCompFields) {
    var i = 1;
    var addrTo = "";
    var addrCc = "";
    var addrBcc = "";
    var to_Sep = "";
    var cc_Sep = "";
    var bcc_Sep = "";

    var recipientType;
    var inputField;
    var fieldValue;
    var recipient;
    while ((inputField = awGetInputElement(i)))
    {
      fieldValue = inputField.value;

      if (fieldValue === null)
        fieldValue = inputField.getAttribute("value");

      if (fieldValue !== "") {
        recipientType = awGetPopupElement(i).selectedItem.getAttribute("value");
        recipient = null;

        switch (recipientType)
        {
          case "addr_to"    :
          case "addr_cc"    :
          case "addr_bcc"   :
            try {
              // let headerParser = MailServices.headerParser;
              // recipient = [headerParser.makeMimeAddress(fullValue.name,
              //                                           fullValue.email) for
              //     (fullValue of
              //       headerParser.makeFromDisplayAddress(fieldValue, {}))]
              //   .join(", ");
              recipient = gMimeHeaderParser.reformatUnquotedAddresses(fieldValue);
            } catch (ex) {
              recipient = fieldValue;
            }
            break;
        }

        switch (recipientType)
        {
          case "addr_to"          : addrTo += to_Sep + recipient; to_Sep = ",";    break;
          case "addr_cc"          : addrCc += cc_Sep + recipient; cc_Sep = ",";    break;
          case "addr_bcc"         : addrBcc += bcc_Sep + recipient; bcc_Sep = ","; break;
        }
      }
      i ++;
    }

    msgCompFields.to = addrTo;
    msgCompFields.cc = addrCc;
    msgCompFields.bcc = addrBcc;
  }
  else
    dumper.dump("Message Compose Error: msgCompFields is null (ExtractRecipients)");
}

function awSetInputAndPopupId(inputElem, popupElem, rowNumber)
{
  popupElem.id = "addressCol1#" + rowNumber;
  inputElem.id = "addressCol2#" + rowNumber;
  inputElem.setAttribute("aria-labelledby", popupElem.id);
}

function awSetInputAndPopupValue(inputElem, inputValue, popupElem, popupValue, rowNumber)
{
  inputValue = inputValue.trimLeft();

  inputElem.setAttribute("value", inputValue);
  inputElem.value = inputValue;

  popupElem.selectedItem = popupElem.childNodes[0].childNodes[awGetSelectItemIndex(popupValue)];

  if (rowNumber >= 0)
    awSetInputAndPopupId(inputElem, popupElem, rowNumber);

  _awSetAutoComplete(popupElem, inputElem);

  onRecipientsChanged(true);
}

function _awSetInputAndPopup(inputValue, popupValue, parentNode, templateNode)
{
  top.MAX_RECIPIENTS++;

  var newNode = templateNode.cloneNode(true);
  parentNode.appendChild(newNode); // we need to insert the new node before we set the value of the select element!

  var input = newNode.getElementsByTagName(awInputElementName());
  var select = newNode.getElementsByTagName(awSelectElementName());

  if (input && input.length === 1 && select && select.length === 1)
    awSetInputAndPopupValue(input[0], inputValue, select[0], popupValue, top.MAX_RECIPIENTS)
}

// this was broken out of awAddRecipients so it can be re-used...adds a new row matching recipientType and
// drops in the single address.
function awAddRecipient(recipientType, address)
{
  for (var row = 1; row <= top.MAX_RECIPIENTS; row++)
  {
    if (awGetInputElement(row).value === "")
      break;
  }

  if (row > top.MAX_RECIPIENTS)
    awAppendNewRow(false);

  awSetInputAndPopupValue(awGetInputElement(row), address, awGetPopupElement(row), recipientType, row);

  /* be sure we still have an empty row left at the end */
  if (row === top.MAX_RECIPIENTS) {
    awAppendNewRow(true);
    awSetInputAndPopupValue(awGetInputElement(top.MAX_RECIPIENTS), "", awGetPopupElement(top.MAX_RECIPIENTS), recipientType, top.MAX_RECIPIENTS);
  }
}

function awCleanupRows()
{
  var maxRecipients = top.MAX_RECIPIENTS;
  var rowID = 1;

  for (var row = 1; row <= maxRecipients; row++)
  {
    var inputElem = awGetInputElement(row);
    if (inputElem.value === "" && row < maxRecipients) {
      awRemoveRow(awGetRowByInputElement(inputElem));
    } else {
      awSetInputAndPopupId(inputElem, awGetPopupElement(row), rowID);
      rowID++;
    }
  }
}

function awDeleteRow(rowToDelete)
{
  /* When we delete a row, we must reset the id of other rows in order to not break the sequence */
  var maxRecipients = top.MAX_RECIPIENTS;
  awRemoveRow(rowToDelete);

  // assume 2 column update (input and popup)
  for (var row = rowToDelete + 1; row <= maxRecipients; row++)
    awSetInputAndPopupId(awGetInputElement(row), awGetPopupElement(row), (row-1));
}

function awClickEmptySpace(target, setFocus)
{
  if (document.getElementById("addressCol2#1").disabled || target === null ||
      (target.localName !== "listboxbody" &&
       target.localName !== "listcell" &&
       target.localName !== "listitem"))
    return;

  var lastInput = awGetInputElement(top.MAX_RECIPIENTS);

  if (lastInput && lastInput.value)
    awAppendNewRow(setFocus);
  else
    if (setFocus)
      awSetFocus(top.MAX_RECIPIENTS, lastInput);
}

function awReturnHit(inputElement)
{
  var row = awGetRowByInputElement(inputElement);
  var nextInput = awGetInputElement(row+1);

  if (!nextInput) {
    if (inputElement.value)
      awAppendNewRow(true);
  } else {
    nextInput.select();
    awSetFocus(row+1, nextInput);
  }
}

function awDeleteHit(inputElement)
{
  var row = awGetRowByInputElement(inputElement);

  /* 1. don't delete the row if it's the last one remaining, just reset it! */
  if (top.MAX_RECIPIENTS <= 1) {
    inputElement.value = "";
    return;
  }

  /* 2. Set the focus to the previous field if possible */
  if (row > 1)
    awSetFocus(row - 1, awGetInputElement(row - 1))
  else
    awSetFocus(1, awGetInputElement(2))   /* We have to cheat a little bit because the focus will */
                                          /* be set asynchronously after we delete the current row, */
                                          /* therefore the row number still the same! */

  /* 3. Delete the row */
  awDeleteRow(row);
}

function awAppendNewRow(setFocus)
{
  var listbox = document.getElementById("addressingWidget");
  var listitem1 = awGetListItem(1);

  if (listbox && listitem1) {
    var lastRecipientType = awGetPopupElement(top.MAX_RECIPIENTS).selectedItem.getAttribute("value");

    var nextDummy = awGetNextDummyRow();
    var newNode = listitem1.cloneNode(true);
    if (nextDummy)
      listbox.replaceChild(newNode, nextDummy);
    else
      listbox.appendChild(newNode);

    top.MAX_RECIPIENTS++;

    var input = newNode.getElementsByTagName(awInputElementName());
    if (input && input.length === 1) {
      var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
      var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

      input[0].setAttribute("value", "");

      if ((appInfo.ID === THUNDERBIRD_ID && versionChecker.compare(appInfo.version, "26.0a1") < 0) ||
          (appInfo.ID === SEAMONKEY_ID && versionChecker.compare(appInfo.version, "2.23a1") < 0)) {
        //this copies the autocomplete sessions list from recipient#1
        input[0].syncSessions(document.getElementById("addressCol2#1"));

    	  // also clone the showCommentColumn setting
    	  //
  	   input[0].showCommentColumn =
	        document.getElementById("addressCol2#1").showCommentColumn;
      }

      // We always clone the first row.  The problem is that the first row
      // could be focused.  When we clone that row, we end up with a cloned
      // XUL textbox that has a focused attribute set.  Therefore we think
      // we're focused and don't properly refocus.  The best solution to this
      // would be to clone a template row that didn't really have any presentation,
      // rather than using the real visible first row of the listbox.
      //
      // For now we'll just put in a hack that ensures the focused attribute
      // is never copied when the node is cloned.
      if (input[0].getAttribute("focused") !== "")
        input[0].removeAttribute("focused");
    }
    var select = newNode.getElementsByTagName(awSelectElementName());
    if (select && select.length === 1) {
      select[0].selectedIndex = awGetSelectItemIndex(lastRecipientType);
      awSetInputAndPopupId(input[0], select[0], top.MAX_RECIPIENTS);
      if (input)
        _awSetAutoComplete(select[0], input[0]);
    }

    // focus on new input widget
    if (setFocus && input[0])
      awSetFocus(top.MAX_RECIPIENTS, input[0]);
  }
}

// functions for accessing the elements in the addressing widget

function awGetPopupElement(row)
{
  return document.getElementById("addressCol1#" + row);
}

function awGetInputElement(row)
{
  return document.getElementById("addressCol2#" + row);
}

function awGetListItem(row)
{
  var listbox = document.getElementById("addressingWidget");

  if (listbox && row > 0) {
    var listitems = listbox.getElementsByTagName("listitem");
    if (listitems && listitems.length >= row)
      return listitems[row-1];
  }
  return 0;
}

function awGetRowByInputElement(inputElement)
{
  var row = 0;
  if (inputElement) {
    var listitem = inputElement.parentNode.parentNode;
    while (listitem) {
      if (listitem.localName === "listitem")
        ++row;
      listitem = listitem.previousSibling;
    }
  }
  return row;
}

// remove row

function awRemoveRow(row)
{
  var listbox = document.getElementById("addressingWidget");

  awRemoveNodeAndChildren(listbox, awGetListItem(row));
  awFitDummyRows();

  top.MAX_RECIPIENTS--;
}

function awRemoveNodeAndChildren(parent, nodeToRemove)
{
  nodeToRemove.parentNode.removeChild(nodeToRemove);
}

function awSetFocus(row, inputElement)
{
  top.awRow = row;
  top.awInputElement = inputElement;
  setTimeout(function() { _awSetFocus() }, 0);
}

function _awSetFocus()
{
  var listbox = document.getElementById("addressingWidget");
  var theNewRow = awGetListItem(top.awRow);

  //Warning: firstVisibleRow is zero base but top.awRow is one base!
  var firstVisibleRow = listbox.getIndexOfFirstVisibleRow();
  var numOfVisibleRows = listbox.getNumberOfVisibleRows();

  //Do we need to scroll in order to see the selected row?
  if (top.awRow <= firstVisibleRow)
    listbox.scrollToIndex(top.awRow - 1);
  else if (top.awRow - 1 >= (firstVisibleRow + numOfVisibleRows))
    listbox.scrollToIndex(top.awRow - numOfVisibleRows);

  top.awInputElement.focus();
}

function awTabFromRecipient(element, event)
{
  var row = awGetRowByInputElement(element);
  if (!event.shiftKey && row < top.MAX_RECIPIENTS) {
    var listBoxRow = row - 1; // listbox row indices are 0-based, ours are 1-based.
    var listBox = document.getElementById("addressingWidget");
    listBox.listBoxObject.ensureIndexIsVisible(listBoxRow + 1);
  }
}

function awTabFromMenulist(element, event)
{
  var row = awGetRowByInputElement(element);
  if (event.shiftKey && row > 1) {
    var listBoxRow = row - 1; // listbox row indices are 0-based, ours are 1-based.
    var listBox = document.getElementById("addressingWidget");
    listBox.listBoxObject.ensureIndexIsVisible(listBoxRow - 1);
  }
}

function awGetNumberOfRecipients()
{
  return top.MAX_RECIPIENTS;
}

function DragOverAddressingWidget(event)
{
  var validFlavor = false;
  var dragSession = dragSession = gDragService.getCurrentSession();

  if (dragSession.isDataFlavorSupported("text/x-moz-address"))
    validFlavor = true;

  if (validFlavor)
    dragSession.canDrop = true;
}

function DropOnAddressingWidget(event)
{
  var dragSession = gDragService.getCurrentSession();

  var trans = Cc["@mozilla.org/widget/transferable;1"].
              createInstance(Ci.nsITransferable);
  trans.init(getLoadContext());
  trans.addDataFlavor("text/x-moz-address");

  for (var i = 0; i < dragSession.numDropItems; ++i)
  {
    dragSession.getData(trans, i);
    var dataObj = new Object();
    var bestFlavor = new Object();
    var len = new Object();
    trans.getAnyTransferData(bestFlavor, dataObj, len);
    if (dataObj)
      dataObj = dataObj.value.QueryInterface(Ci.nsISupportsString);
    if (!dataObj)
      continue;

    // pull the address out of the data object
    var address = dataObj.data.substring(0, len.value);
    if (!address)
      continue;

    DropRecipient(event.target, address);
  }
}

function DropRecipient(target, recipient)
{
  // break down and add each address
  return parseAndAddAddresses(recipient, awGetInputElement(top.MAX_RECIPIENTS).selectedItem.getAttribute("value"));
}

function _awSetAutoComplete(selectElem, inputElem)
{
  let params = JSON.parse(inputElem.getAttribute('autocompletesearchparam'));
  params.type = selectElem.value;
  inputElem.setAttribute('autocompletesearchparam', JSON.stringify(params));
}

function awSetAutoComplete(rowNumber)
{
  var inputElem = awGetInputElement(rowNumber);
  var selectElem = awGetPopupElement(rowNumber);
  _awSetAutoComplete(selectElem, inputElem)
}

function awRecipientTextCommandPre31(userAction, element)
{
  if (userAction === "typing" || userAction === "scrolling")
    awReturnHit(element);
}

function awRecipientKeyPress(event, element)
{
  switch(event.keyCode) {
  case KeyEvent.DOM_VK_UP:
    awArrowHit(element, -1);
    break;
  case KeyEvent.DOM_VK_DOWN:
    awArrowHit(element, 1);
    break;
  case KeyEvent.DOM_VK_RETURN:
  case KeyEvent.DOM_VK_TAB:
    // if the user text contains a comma or a line return, ignore
    // str.contains is new to ECMAScript 6
    // if (element.value.contains(","))
    if (element.value.search(",") !== -1) {
      var addresses = element.value;
      element.value = ""; // clear out the current line so we don't try to autocomplete it..
      parseAndAddAddresses(addresses, awGetPopupElement(awGetRowByInputElement(element)).selectedItem.getAttribute("value"));
    } else
      if (event.keyCode == KeyEvent.DOM_VK_TAB)
        awTabFromRecipient(element, event);

    break;
  }
}

function awArrowHit(inputElement, direction)
{
  var row = awGetRowByInputElement(inputElement) + direction;
  if (row) {
    var nextInput = awGetInputElement(row);

    if (nextInput)
      awSetFocus(row, nextInput);
    else if (inputElement.value)
      awAppendNewRow(true);
  }
}

function awRecipientKeyDown(event, element)
{
  switch(event.keyCode) {
  case KeyEvent.DOM_VK_DELETE:
  case KeyEvent.DOM_VK_BACK_SPACE:
    if (!element.value)
      awDeleteHit(element);

    // We need to stop the event else the listbox will receive it and the
    // function awKeyDown will be executed!
    event.stopPropagation();
    break;
  }
}

function awKeyDown(event, listboxElement)
{
  switch(event.keyCode) {
  case KeyEvent.DOM_VK_DELETE:
  case KeyEvent.DOM_VK_BACK_SPACE:
    /* Warning, the listboxElement.selectedItems will change everytime we delete a row */
    var selItems = listboxElement.selectedItems;
    var length = listboxElement.selectedItems.length;
    for (var i = 1; i <= length; i++) {
      var inputs = listboxElement.selectedItems[0].getElementsByTagName(awInputElementName());
      if (inputs && inputs.length === 1)
        awDeleteHit(inputs[0]);
    }
    break;
  }
}

function awMenulistKeyPress(event, element)
{
  switch(event.keyCode) {
  case KeyEvent.DOM_VK_TAB:
    awTabFromMenulist(element, event);
    break;
  }
}

/* ::::::::::: addressing widget dummy rows ::::::::::::::::: */

var gAWContentHeight = 0;
var gAWRowHeight = 0;

function awFitDummyRows()
{
  awCalcContentHeight();
  awCreateOrRemoveDummyRows();
}

function awCreateOrRemoveDummyRows()
{
  let listbox = document.getElementById("addressingWidget");
  let listboxHeight = listbox.boxObject.height;

  // remove rows to remove scrollbar
  let kids = listbox.querySelectorAll('[_isDummyRow]');
  for (let i = kids.length-1; gAWContentHeight > listboxHeight && i >= 0; --i) {
    gAWContentHeight -= gAWRowHeight;
    listbox.removeChild(kids[i]);
  }

  // add rows to fill space
  if (gAWRowHeight) {
    while (gAWContentHeight + gAWRowHeight < listboxHeight) {
      awCreateDummyItem(listbox);
      gAWContentHeight += gAWRowHeight;
    }
  }
}

function awCalcContentHeight()
{
  var listbox = document.getElementById("addressingWidget");
  var items = listbox.getElementsByTagName("listitem");

  gAWContentHeight = 0;
  if (items.length > 0) {
    // all rows are forced to a uniform height in xul listboxes, so
    // find the first listitem with a boxObject and use it as precedent
    var i = 0;
    do {
      gAWRowHeight = items[i].boxObject.height;
      ++i;
    } while (i < items.length && !gAWRowHeight);
    gAWContentHeight = gAWRowHeight*items.length;
  }
}

function awCreateDummyItem(aParent)
{
  var titem = document.createElement("listitem");
  titem.setAttribute("_isDummyRow", "true");
  titem.setAttribute("class", "dummy-row");

  for (var i = awGetNumberOfCols(); i > 0; i--)
    awCreateDummyCell(titem);

  if (aParent)
    aParent.appendChild(titem);

  return titem;
}

function awCreateDummyCell(aParent)
{
  var cell = document.createElement("listcell");
  cell.setAttribute("class", "addressingWidgetCell dummy-row-cell");
  if (aParent)
    aParent.appendChild(cell);

  return cell;
}

function awGetNextDummyRow()
{
  // gets the next row from the top down
  return document.querySelector('#addressingWidget > [_isDummyRow]');
}

function awSizerListen()
{
  // when splitter is clicked, fill in necessary dummy rows each time the mouse is moved
  awCalcContentHeight(); // precalculate
  document.addEventListener("mousemove", awSizerMouseMove, true);
  document.addEventListener("mouseup", awSizerMouseUp, false);
}

function awSizerMouseMove()
{
  awCreateOrRemoveDummyRows();
}

function awSizerMouseUp()
{
  document.removeEventListener("mousemove", awSizerMouseMove, true);
  document.removeEventListener("mouseup", awSizerMouseUp, false);
}

function awDocumentKeyPress(event)
{
  try {
    var id = event.target.id;
    if (id.startsWith('addressCol1'))
      awMenulistKeyPress(event, event.target);
  } catch (e) { }
}

// Given an arbitrary block of text like a comma delimited list of names or a names separated by spaces,
// we will try to autocomplete each of the names and then take the FIRST match for each name, adding it the
// addressing widget on the compose window.

var gAutomatedAutoCompleteListener = null;

function parseAndAddAddresses(addressText, recipientType)
{
  // strip any leading >> characters inserted by the autocomplete widget
  var strippedAddresses = addressText.replace(/.* >> /, "");

  var addresses = {};
  var names = {};
  var fullNames = {};
  let numAddresses = MailServices.headerParser.parseHeadersWithArray(strippedAddresses, addresses, names, fullNames);

  if (numAddresses > 0) {
    // we need to set up our own autocomplete session and search for results

    setupAutocomplete(); // be safe, make sure we are setup
    if (!gAutomatedAutoCompleteListener)
      gAutomatedAutoCompleteListener = new AutomatedAutoCompleteHandler();

    gAutomatedAutoCompleteListener.init(fullNames.value, numAddresses, recipientType);
  }
}

function AutomatedAutoCompleteHandler()
{
}

// state driven self contained object which will autocomplete a block of addresses without any UI.
// force picks the first match and adds it to the addressing widget, then goes on to the next
// name to complete.

AutomatedAutoCompleteHandler.prototype =
{
  param: this,
  sessionName: null,
  namesToComplete: {},
  numNamesToComplete: 0,
  indexIntoNames: 0,

  numSessionsToSearch: 0,
  numSessionsSearched: 0,
  recipientType: null,
  searchResults: null,

  init: function(namesToComplete, numNamesToComplete, recipientType)
  {
    this.indexIntoNames = 0;
    this.numNamesToComplete = numNamesToComplete;
    this.namesToComplete = namesToComplete;

    this.recipientType = recipientType;

    // set up the auto complete sessions to use
    setupAutocomplete();
    this.autoCompleteNextAddress();
  },

  autoCompleteNextAddress: function()
  {
    this.numSessionsToSearch = 0;
    this.numSessionsSearched = 0;
    this.searchResults = new Array;

    if (this.indexIntoNames < this.numNamesToComplete && this.namesToComplete[this.indexIntoNames]) {
    	/* XXX This is used to work, until switching to the new toolkit broke it
         We should fix it see bug 456550.
      if (!this.namesToComplete[this.indexIntoNames].contains("@")) // don't autocomplete if address has an @ sign in it
      {
        // make sure total session count is updated before we kick off ANY actual searches
        if (gAutocompleteSession)
          this.numSessionsToSearch++;

        if (gLDAPSession && gCurrentAutocompleteDirectory)
          this.numSessionsToSearch++;

        if (gAutocompleteSession)
        {
           gAutocompleteSession.onAutoComplete(this.namesToComplete[this.indexIntoNames], null, this);
           // AB searches are actually synchronous. So by the time we get here we have already looked up results.

           // if we WERE going to also do an LDAP lookup, then check to see if we have a valid match in the AB, if we do
           // don't bother with the LDAP search too just return

           if (gLDAPSession && gCurrentAutocompleteDirectory && this.searchResults[0] && this.searchResults[0].defaultItemIndex !== -1)
           {
             this.processAllResults();
             return;
           }
        }

        if (gLDAPSession && gCurrentAutocompleteDirectory)
          gLDAPSession.onStartLookup(this.namesToComplete[this.indexIntoNames], null, this);
      }
      */

      if (!this.numSessionsToSearch)
        this.processAllResults(); // ldap and ab are turned off, so leave text alone
    }
  },

  onStatus: function(aStatus)
  {
    return;
  },

  onAutoComplete: function(aResults, aStatus)
  {
    // store the results until all sessions are done and have reported in
    if (aResults)
      this.searchResults[this.numSessionsSearched] = aResults;

    this.numSessionsSearched++; // bump our counter

    if (this.numSessionsToSearch <= this.numSessionsSearched)
      setTimeout(function() { gAutomatedAutoCompleteListener.processAllResults() } , 0); // we are all done
  },

  processAllResults: function()
  {
    // Take the first result and add it to the compose window
    var addressToAdd;

    // loop through the results looking for the non default case (default case is the address book with only one match, the default domain)
    var sessionIndex;

    var searchResultsForSession;

    for (sessionIndex in this.searchResults)
    {
      searchResultsForSession = this.searchResults[sessionIndex];
      if (searchResultsForSession && searchResultsForSession.defaultItemIndex > -1) {
        addressToAdd = searchResultsForSession.items.QueryElementAt(searchResultsForSession.defaultItemIndex, Ci.nsIAutoCompleteItem).value;
        break;
      }
    }

    // still no match? loop through looking for the -1 default index
    if (!addressToAdd) {
      for (sessionIndex in this.searchResults)
      {
        searchResultsForSession = this.searchResults[sessionIndex];
        if (searchResultsForSession && searchResultsForSession.defaultItemIndex === -1) {
          addressToAdd = searchResultsForSession.items.QueryElementAt(0, Ci.nsIAutoCompleteItem).value;
          break;
        }
      }
    }

    // no matches anywhere...just use what we were given
    if (!addressToAdd)
      addressToAdd = this.namesToComplete[this.indexIntoNames];

    // that will automatically set the focus on a new available row, and make sure it is visible
    awAddRecipient(this.recipientType ? this.recipientType : "addr_to", addressToAdd);

    this.indexIntoNames++;
    this.autoCompleteNextAddress();
  },

  QueryInterface : function(iid)
  {
      if (iid.equals(Ci.nsIAutoCompleteListener) ||
          iid.equals(Ci.nsISupports))
        return this;
      throw Components.results.NS_NOINTERFACE;
  }
}

// Returns the load context for the current window
function getLoadContext() {
  return window.QueryInterface(Ci.nsIInterfaceRequestor)
               .getInterface(Ci.nsIWebNavigation)
               .QueryInterface(Ci.nsILoadContext);
}
