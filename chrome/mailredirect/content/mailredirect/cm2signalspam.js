// Ticket 0004853: Ajout d'une fonctionnalite de signalement de spam


ChromeUtils.import("resource://gre/modules/Services.jsm");



// boutons signaler spamSettings
// preferences:
// courrielleur.btspam.<n>.libelle : libelle du menu
// courrielleur.btspam.<n>.to : destinataire (adresse courriel)
// <n> : entier de 0 a 9
function cm2InitMenuJunk(){

  let hdrJunkDropdown=document.getElementById("hdrJunkDropdown");

  for (let i=hdrJunkDropdown.childNodes.length; i>2; --i)
    hdrJunkDropdown.lastChild.remove();

  for (i=0;i<2;i++){
    if (Services.prefs.prefHasUserValue("courrielleur.btspam."+i+".to")){

      let dest=Services.prefs.getCharPref("courrielleur.btspam."+i+".to");

      // destinataire vide => supprimer signalement
      if (""==dest){
        Services.prefs.clearUserPref("courrielleur.btspam."+i+".to");
        Services.prefs.clearUserPref("courrielleur.btspam."+i+".libelle");
        continue;
      }

      let lib=Services.prefs.getStringPref("courrielleur.btspam."+i+".libelle");

      let newMenuItem=document.createElement("menuitem");
      newMenuItem.setAttribute("label", lib);
      newMenuItem.setAttribute("value", dest);
      newMenuItem.setAttribute('oncommand', 'cm2SignalSpam("'+dest+'");event.stopPropagation();');

      hdrJunkDropdown.appendChild(newMenuItem);
    }
  }
}

function cm2InitPopupJunk(){

  let junkPopup=document.getElementById("mailContext-junkPopup");
  let sep=document.getElementById("mailContext-sep-afterMarkAsJunk");

  for (let i=1; i<junkPopup.childNodes.length-2;){
    let child=junkPopup.childNodes[i];
    if ("mailContext-sep-afterMarkAsJunk"==child.id)
      break;
    junkPopup.removeChild(child);
  }

  for (i=0;i<2;i++){
    if (Services.prefs.prefHasUserValue("courrielleur.btspam."+i+".to")){

      let dest=Services.prefs.getCharPref("courrielleur.btspam."+i+".to");

      // destinataire vide => supprimer signalement
      if (""==dest){
        Services.prefs.clearUserPref("courrielleur.btspam."+i+".to");
        Services.prefs.clearUserPref("courrielleur.btspam."+i+".libelle");
        continue;
      }

      let lib=Services.prefs.getStringPref("courrielleur.btspam."+i+".libelle");

      let newMenuItem=document.createElement("menuitem");
      newMenuItem.setAttribute("label", lib);
      newMenuItem.setAttribute("value", dest);
      newMenuItem.setAttribute('oncommand', 'cm2SignalSpam("'+dest+'");event.stopPropagation();');

      junkPopup.insertBefore(newMenuItem, sep);
    }
  }
}


function cm2SignalSpam(courriel){

  // cas offline
  if (Services.io.offline){

    let bundle=Services.strings.createBundle("chrome://mailredirect/locale/cm2signalspam.properties");
    let msg=bundle.GetStringFromName("signalspam-offline");
    Services.prompt.alert(window, null, msg);
    return;
  }

  window.setCursor("wait");

  try{

    MailredirectExtension.cm2SignalSpam(courriel, retourRedirect);

  } catch(ex){}

  window.setCursor("auto");
}

function retourRedirect(success, nbMessages){

  window.setCursor("auto");

  if (success){

    let bundle=Services.strings.createBundle("chrome://mailredirect/locale/cm2signalspam.properties");
    let titre=bundle.GetStringFromName("signalspam-titre");
    let msg;
    
    if (1<nbMessages){
      msg=bundle.GetStringFromName("signalspam-mercis");
    } else {
      msg=bundle.GetStringFromName("signalspam-merci");
    }

    Services.prompt.alert(window, titre, msg);

    MsgJunk();
  }
}
