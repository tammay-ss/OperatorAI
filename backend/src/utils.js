const axios = require('axios');

module.exports.getCoordinates = async (location) => {
  try {
    // Make a GET request to the Google Geocode API to retrieve coordinates with India bias
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: `${location}, India`,
        region: 'in',
        components: 'country:IN',
        key: process.env.MAPS_API_KEY,
      },
    });

    if (response.data?.results?.length > 0) {
      const lat = response.data.results[0].geometry.location.lat;
      const lng = response.data.results[0].geometry.location.lng;
      return { lat, lng };
    }

    return undefined;
  } catch (error) {
    console.error('Error fetching geocoordinates:', error);
  }
};

const getNamedEntities = async (transcript, useExpensiveModel = false) => {
  // Primary: ai4bharat/IndicNER for Indian context; Fallback: roberta-large-ner-english
  const model = useExpensiveModel ? 'Jean-Baptiste/roberta-large-ner-english' : 'ai4bharat/IndicNER';

  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY2;

  if (useExpensiveModel) {
    console.info('Using expensive / fallback NER model...');
  }

  try {
    const { data } = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: transcript,
        options: {
          wait_for_model: useExpensiveModel,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${hfKey}`,
        },
      }
    );

    if (data?.error) {
      console.log('request resolved with error', data);

      return {
        name: undefined,
        location: undefined,
      };
    }

    const namedEntities = (data ?? []).sort(({ score: scoreA }, { score: scoreB }) => (scoreB ?? 0) - (scoreA ?? 0));

    // Support both entity_group ('PER', 'LOC', 'ORG') and raw token labels ('B-PER', 'I-PER', 'B-LOC', etc.)
    const nameItem = namedEntities.find((item) => {
      const group = item.entity_group || item.entity;
      return group === 'PER' || (typeof group === 'string' && group.includes('PER'));
    });
    const name = nameItem?.word || nameItem?.token;

    const locationItem = namedEntities.find((item) => {
      const group = item.entity_group || item.entity;
      return (
        ['LOC', 'ORG'].includes(group) ||
        (typeof group === 'string' && (group.includes('LOC') || group.includes('ORG')))
      );
    });
    const location = locationItem?.word || locationItem?.token;

    return { name, location };
  } catch (error) {
    console.error('Error finding named entities', error);

    return {
      name: undefined,
      location: undefined,
    };
  }
};

const getEmergencyType = async (transcript) => {
  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY2;

  try {
    const { data } = await axios.post(
      'https://api-inference.huggingface.co/models/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli',
      {
        inputs: transcript,
        parameters: {
          candidate_labels: [
            'medical emergency',
            'fire emergency',
            'traffic accident',
            'crime in progress',
            'other emergency',
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${hfKey}`,
        },
      }
    );

    if (!data || !data?.labels || !data.labels.length) {
      console.log('request resolved with missing data', data);

      return {
        emergencyType: undefined,
      };
    }

    return {
      emergencyType: data.labels[0].replace(/\b[a-z]/gi, (c) => c.toUpperCase()),
    };
  } catch (error) {
    console.error('Error finding emergency type', error);

    return {
      emergencyType: undefined,
    };
  }
};

module.exports.analyzeTranscript = async (transcript) => {
  try {
    const strippedTranscript = transcript.replace(/[A-Z.]/g, (char) => char.toLowerCase()).replace(/\./g, '');

    const { name, location } = await getNamedEntities(strippedTranscript);
    const { emergencyType } = await getEmergencyType(strippedTranscript);

    return {
      name,
      location,
      emergencyType,
    };
  } catch (error) {
    console.error(error);
  }
};

module.exports.getNamedEntities = (transcript, useExpensiveModel = false) => {
  const strippedTranscript = transcript.replace(/[A-Z.]/g, (char) => char.toLowerCase()).replace(/\./g, '');
  return getNamedEntities(strippedTranscript, useExpensiveModel);
};

module.exports.analyzePriority = (transcript) => {
  // Use regex to search for keywords that indicate a high-priority call
  const highPriorityKeywords = [
    'shots',
    'kill',
    'gun',
    'shot',
    'fire',
    'injured',
    'robb',
    'assault',
    'murder',
    'homicide',
    'kidnap',
    'armed',
    'suspect',
    'explosion',
    'blast',
    'dead',
    'die',
    'stampede',
    'heart attack',
    'unconscious',
    'cylinder',
  ];
  const highPriorityRegex = new RegExp(highPriorityKeywords.join('|'), 'gi');

  // Use regex to search for keywords that indicate a medium-priority call
  const mediumPriorityKeywords = [
    'suspicious',
    'traffic',
    'accident',
    'noise',
    'complaint',
    'missing person',
    'animal',
    'bite',
    'vandalism',
    'fight',
    'break-in',
    'theft',
    'chori',
    'dacoity',
    'snake',
  ];
  const mediumPriorityRegex = new RegExp(mediumPriorityKeywords.join('|'), 'gi');

  // Use regex to search for keywords that indicate a low-priority call
  const lowPriorityKeywords = ['lost', 'property', 'inquiry', 'advice', 'noise', 'graffiti', 'parking', 'garbage'];
  const lowPriorityRegex = new RegExp(lowPriorityKeywords.join('|'), 'gi');

  // Check if transcript contains any high-priority keywords
  if (transcript.match(highPriorityRegex)) {
    return 'HIGH';
  }
  // Check if transcript contains any medium-priority keywords
  else if (transcript.match(mediumPriorityRegex)) {
    return 'MEDIUM';
  }
  // Check if transcript contains any low-priority keywords
  else if (transcript.match(lowPriorityRegex)) {
    return 'LOW';
  }
  // If no keywords are found, return unknown priority
  else {
    return 'TBD';
  }
};
