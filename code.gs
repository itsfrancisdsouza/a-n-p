/**
 * Attendance logging with auto-generated Log ID and selfie upload to Google Drive.
 *
 * Sheet columns:
 * A: Sr.No.
 * B: Log ID (Auto Generate)
 * C: Staff ID
 * D: Date
 * E: Time
 * F: Selfie
 * G: Location
 * H: Google Map Link
 * I: Branch
 * J: Distance Validation
 *
 * SHEET_NAME = 'attendanceLog'
 * DRIVE_FOLDER_ID = '18wIH8tt4pNfvbM4UOCludXgOlZYrdF-G'
 */

const SHEET_NAME = 'attendanceLog';
const DRIVE_FOLDER_ID = '18wIH8tt4pNfvbM4UOCludXgOlZYrdF-G';
const STAFF_DB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTktOv0rOPllFSkl7K5aVOx9gb_xsXF8F-MSj04RHmXMQHmzxAI_KL6VN-_38WG5mI0Gkh62ls1TXKA/pub?gid=0&single=true&output=csv';

function calculateDistanceFromBranch(lat1, lon1, selectedBranch) {
  try {
    // Fetch staff database CSV
    const response = UrlFetchApp.fetch(STAFF_DB_URL);
    const csvText = response.getContentText();
    
    // Parse CSV properly
    const rows = parseCSV(csvText);
    
    // Parse CSV data
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    const staffDatabase = dataRows.map(row => {
      const branch = {};
      headers.forEach((header, index) => {
        branch[header.trim()] = row[index] ? row[index].trim() : '';
      });
      return branch;
    });
    
    // Find the selected branch
    const branchData = staffDatabase.find(branch => branch['Branch'] === selectedBranch);
    
    if (branchData && branchData['Location']) {
      // Parse location coordinates from the database
      const locationCoords = branchData['Location'].split(',').map(coord => parseFloat(coord.trim()));
      const branchLatitude = locationCoords[0];
      const branchLongitude = locationCoords[1];
      
      // Haversine formula to calculate distance
      const R = 6371000; // Earth's radius in meters
      const dLat = (branchLatitude - lat1) * Math.PI / 180;
      const dLon = (branchLongitude - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(branchLatitude * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // Distance in meters
      return distance;
    }
    return 999999; // Return large distance if branch not found
  } catch (error) {
    console.error('Error fetching staff database:', error);
    return 999999; // Return large distance on error
  }
}

function parseCSV(csvText) {
  const rows = [];
  const lines = csvText.split('\n');
  
  for (let line of lines) {
    if (line.trim() === '') continue;
    
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    row.push(current);
    rows.push(row);
  }
  
  return rows;
}

function determineBranch(latitude, longitude) {
  // You can customize this function based on your branch locations
  // For now, using a simple example based on Mumbai coordinates
  
  // Example branch determination logic
  if (latitude >= 19.0 && latitude <= 19.3 && longitude >= 72.8 && longitude <= 73.0) {
    return 'Mumbai Central';
  } else if (latitude >= 18.9 && latitude <= 19.1 && longitude >= 72.8 && longitude <= 72.9) {
    return 'Mumbai West';
  } else if (latitude >= 19.1 && latitude <= 19.4 && longitude >= 72.8 && longitude <= 73.1) {
    return 'Mumbai North';
  } else {
    return 'Other Location';
  }
}

function doGet(e) {
  // Handle GET requests to the web app
  return ContentService
    .createTextOutput('Attendance System Web App is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doOptions(e) {
  // Handle OPTIONS requests (CORS preflight)
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    // Parse incoming POST data - handle both form data and JSON
    let payload;
    const contentType = e.postData.type || '';
    
    console.log('Received POST request with content type:', contentType);
    console.log('Post data contents length:', e.postData.contents.length);
    console.log('Available parameters:', Object.keys(e.parameter));
    
    if (contentType.includes('application/json')) {
      // Direct JSON data from fetch API (Android/Desktop)
      try {
        payload = JSON.parse(e.postData.contents);
        console.log('Parsed JSON payload successfully');
      } catch (jsonError) {
        console.error('JSON parsing failed:', jsonError);
        throw new Error('Invalid JSON data received');
      }
    } else if (e.parameter.data) {
      // Form data from iframe submission (iOS - most reliable method)
      try {
        payload = JSON.parse(e.parameter.data);
        console.log('Parsed form data payload successfully (iOS method)');
      } catch (formError) {
        console.error('Form data parsing failed:', formError);
        console.error('Raw form data:', e.parameter.data);
        throw new Error('Invalid form data received');
      }
    } else {
      // Try to parse as JSON anyway (fallback)
      try {
        payload = JSON.parse(e.postData.contents);
        console.log('Parsed raw content as JSON successfully');
      } catch (rawError) {
        console.error('Raw content parsing failed:', rawError);
        throw new Error('Unable to parse request data');
      }
    }
    
    console.log('Payload keys:', Object.keys(payload));
    
    const staffId = payload.id;
    const selfieData = payload.selfie; // Base64 dataURL string
    const locationData = payload.location; // Location object
    const selectedBranch = payload.branch; // Selected branch from dropdown
    
    if (!staffId) {
      console.error('Staff ID is missing in payload');
      throw new Error('Staff ID is missing.');
    }

    console.log('Processing attendance for staff ID:', staffId);
    console.log('Location data:', locationData);
    console.log('Selected branch:', selectedBranch);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found.`);

    // Get next Sr.No.
    const lastRow = sheet.getLastRow();
    let srNo = 1;
    if (lastRow > 1) {
      const lastSr = sheet.getRange(lastRow, 1).getValue();
      srNo = lastSr + 1;
    }

    // Generate Log ID
    const now = new Date();
    const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const logId = `LOG${timestamp}${rand}`;

    // Format date & time (Asia/Kolkata)
    const date = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, 'Asia/Kolkata', 'HH:mm:ss');

    // Upload selfie (if present) to Drive
    let selfieUrl = '';
    if (selfieData && selfieData.indexOf('base64,') !== -1) {
      try {
        const imageBlob = Utilities.newBlob(
          Utilities.base64Decode(selfieData.split('base64,')[1]),
          'image/png',
          `${logId}.png`
        );
        const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        const file = folder.createFile(imageBlob);
        selfieUrl = file.getUrl();
        console.log('Selfie uploaded successfully:', selfieUrl);
      } catch (selfieError) {
        console.error('Selfie upload failed:', selfieError);
        selfieUrl = 'Upload failed';
      }
    } else {
      console.log('No selfie data provided or invalid format');
    }

    // Format location data with enhanced iOS support
    let locationString = '';
    let googleMapLink = '';
    let branch = '';
    let distanceValidation = '';
    
    if (locationData && locationData.latitude && locationData.longitude) {
      if (locationData.latitude !== 0 && locationData.longitude !== 0) {
        locationString = `${locationData.latitude}, ${locationData.longitude}`;
        if (locationData.accuracy) {
          locationString += ` (±${Math.round(locationData.accuracy)}m)`;
        }
        
        // Add timestamp if available (useful for iOS debugging)
        if (locationData.timestamp) {
          locationString += ` [${locationData.timestamp}]`;
        }
        
        // Generate Google Map Link
        googleMapLink = `https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`;
        
        // Use selected branch and validate distance
        if (selectedBranch) {
          branch = selectedBranch;
          const distance = calculateDistanceFromBranch(locationData.latitude, locationData.longitude, selectedBranch);
          distanceValidation = distance <= 100 ? 'Valid' : 'Invalid - Too far';
          console.log('Distance validation:', distance, 'meters');
        } else {
          branch = 'No branch selected';
          distanceValidation = 'Unknown';
        }
      } else {
        // Handle iOS-specific location errors
        if (locationData.error) {
          locationString = `Location Error: ${locationData.error}`;
        } else {
          locationString = 'Location unavailable';
        }
        googleMapLink = 'N/A';
        branch = 'Unknown';
        distanceValidation = 'Invalid';
      }
    } else {
      locationString = 'No location data';
      googleMapLink = 'N/A';
      branch = 'Unknown';
      distanceValidation = 'Invalid';
    }

    console.log('Final data to append:');
    console.log('- Sr.No:', srNo);
    console.log('- Log ID:', logId);
    console.log('- Staff ID:', staffId);
    console.log('- Date:', date);
    console.log('- Time:', time);
    console.log('- Selfie URL:', selfieUrl);
    console.log('- Location:', locationString);
    console.log('- Branch:', branch);
    console.log('- Distance Validation:', distanceValidation);

    // Append new row
    sheet.appendRow([
      srNo,
      logId,
      staffId,
      date,
      time,
      selfieUrl,
      locationString,
      googleMapLink,
      branch,
      distanceValidation
    ]);

    console.log('Row appended successfully to sheet');

    // Success response with enhanced location info
    const responseData = {
      status: 'success',
      logId: logId,
      date: date,
      time: time,
      selfieUrl: selfieUrl,
      location: locationString,
      googleMapLink: googleMapLink,
      branch: branch,
      distanceValidation: distanceValidation,
      locationDetails: {
        hasLocation: locationData && locationData.latitude !== 0 && locationData.longitude !== 0,
        accuracy: locationData ? locationData.accuracy : null,
        timestamp: locationData ? locationData.timestamp : null,
        error: locationData ? locationData.error : null
      }
    };

    console.log('Sending success response:', responseData);

    return ContentService
      .createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('Error in doPost:', err);
    
    // Error response
    const errorResponse = {
      status: 'error',
      message: err.toString(),
      timestamp: new Date().toISOString()
    };
    
    console.error('Sending error response:', errorResponse);
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
