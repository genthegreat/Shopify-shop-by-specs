import React from 'react';
import { createRoot } from 'react-dom/client';

// Define components directly in this file
const TabButton = ({ label, isActive, onClick }) => (
  <button 
    className={`tablink ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    {label}
  </button>
);

// Collection Card component for reuse across tabs
const CollectionCard = ({ title, handle, image }) => (
  <div className="collection-card">
    <a href={`/collections/${handle}`} className="collection-block-item">
      <div className="collection-image">
        <img 
          src={image || "https://placehold.co/300x300"} 
          alt={title}
          width="300"
          height="300"
        />
      </div>
      <h3>{title}</h3>
    </a>
  </div>
);

// Tab content component that renders a grid of collection cards
const TabContent = ({ collections = [] }) => (
  <div className="tab-inner-content">
    <div className="inner-grid">
      {collections.length > 0 ? (
        collections.map((collection, index) => (
          <CollectionCard 
            key={`${collection.handle}-${index}`}
            title={collection.title}
            handle={collection.handle}
            image={collection.image}
          />
        ))
      ) : (
        <p className="no-items">No collections found</p>
      )}
    </div>
  </div>
);

// Loading indicator component
const LoadingIndicator = () => (
  <div className="loading-indicator">
    <div className="spinner"></div>
    <p>Loading collections...</p>
  </div>
);

// Error message component
const ErrorMessage = ({ message }) => (
  <div className="error-message">
    <p>Error: {message}</p>
    <button onClick={() => window.location.reload()}>Try Again</button>
  </div>
);

// Main App component
const App = () => {
  // Get current collection handle from URL
  const getCurrentCollectionHandle = () => {
    const path = window.location.pathname;
    const match = path.match(/\/collections\/([^\/]+)/);
    return match ? match[1] : null;
  };

  const collectionHandle = getCurrentCollectionHandle();
  
  // State management
  const [activeTab, setActiveTab] = React.useState('byCategory');
  const [relatedCollections, setRelatedCollections] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  
  // Fetch related collections on component mount
  React.useEffect(() => {
    const fetchRelatedCollections = async () => {
      if (!collectionHandle) {
        setError('No collection handle found in URL');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Determine the base URL (works in both development and production)
        const baseUrl = 'https://shopify-shop-by-specs.onrender.com';  // Remove trailing slash
          
        const response = await fetch(`${baseUrl}/related-collections/${collectionHandle}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors', // Explicitly set CORS mode
          credentials: 'omit' // Don't send cookies to avoid preflight complexity
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Fetched related collections:', data);
        setRelatedCollections(data);
        
        // Set initial active tab based on what has content
        if (data.byCategory && data.byCategory.length > 0) {
          setActiveTab('byCategory');
        } else if (data.byManufacturer && data.byManufacturer.length > 0) {
          setActiveTab('byManufacturer');
        } else if (data.parts && data.parts.length > 0) {
          setActiveTab('parts');
        }
      } catch (err) {
        console.error('Error fetching related collections:', err);
        // Provide more helpful error message for CORS issues
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('CORS error: Unable to connect to the API server. This may be a temporary issue with the server.');
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedCollections();
  }, [collectionHandle]);

  // If there's an error, show error message
  if (error) {
    return <ErrorMessage message={error} />;
  }
  
  // If still loading, show loading spinner
  if (loading) {
    return <LoadingIndicator />;
  }
  
  // If no collection handle or no data, show message
  if (!collectionHandle || !relatedCollections) {
    return (
      <div className="container">
        <p>No related collections found or invalid collection page.</p>
      </div>
    );
  }
  
  // Determine which tabs to show based on available data
  const showCategoryTab = relatedCollections.byCategory && relatedCollections.byCategory.length > 0;
  const showManufacturerTab = relatedCollections.byManufacturer && relatedCollections.byManufacturer.length > 0;
  const showSizeTab = relatedCollections.bySizeItem && relatedCollections.bySizeItem.length > 0;
  const showConditionTab = relatedCollections.bySpecs?.condition && relatedCollections.bySpecs.condition.length > 0;
  const showFuelTypeTab = relatedCollections.bySpecs?.fuelType && relatedCollections.bySpecs.fuelType.length > 0;
  const showPartsTab = relatedCollections.parts && relatedCollections.parts.length > 0;
  
  return (
    <div className="container">
      <div className="title-buttons-grid">
        {showCategoryTab && (
          <TabButton 
            label="By Category" 
            isActive={activeTab === 'byCategory'} 
            onClick={() => setActiveTab('byCategory')} 
          />
        )}
        
        {showManufacturerTab && (
          <TabButton 
            label="By Manufacturer" 
            isActive={activeTab === 'byManufacturer'} 
            onClick={() => setActiveTab('byManufacturer')} 
          />
        )}
        
        {showSizeTab && (
          <TabButton 
            label="By Size" 
            isActive={activeTab === 'bySizeItem'} 
            onClick={() => setActiveTab('bySizeItem')} 
          />
        )}
        
        {showConditionTab && (
          <TabButton 
            label="By Condition" 
            isActive={activeTab === 'byCondition'} 
            onClick={() => setActiveTab('byCondition')} 
          />
        )}
        
        {showFuelTypeTab && (
          <TabButton 
            label="By Fuel Type" 
            isActive={activeTab === 'byFuelType'} 
            onClick={() => setActiveTab('byFuelType')} 
          />
        )}
        
        {showPartsTab && (
          <TabButton 
            label="Parts" 
            isActive={activeTab === 'parts'} 
            onClick={() => setActiveTab('parts')} 
          />
        )}
      </div>
      
      {/* Tab content */}
      <div 
        id="byCategory" 
        className="tab-content" 
        style={{ display: activeTab === 'byCategory' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.byCategory} />
      </div>
      
      <div 
        id="byManufacturer" 
        className="tab-content" 
        style={{ display: activeTab === 'byManufacturer' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.byManufacturer} />
      </div>
      
      <div 
        id="bySizeItem" 
        className="tab-content" 
        style={{ display: activeTab === 'bySizeItem' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.bySizeItem} />
      </div>
      
      <div 
        id="byCondition" 
        className="tab-content" 
        style={{ display: activeTab === 'byCondition' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.bySpecs?.condition} />
      </div>
      
      <div 
        id="byFuelType" 
        className="tab-content" 
        style={{ display: activeTab === 'byFuelType' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.bySpecs?.fuelType} />
      </div>
      
      <div 
        id="parts" 
        className="tab-content" 
        style={{ display: activeTab === 'parts' ? 'block' : 'none' }}
      >
        <TabContent collections={relatedCollections.parts} />
      </div>
      
      {/* CSS styles (will be handled by style-loader) */}
      <style>{`
        .tablink {
          background-color: #dadbe2;
          border: 1px #294378 solid;
          border-radius: 20px;
          cursor: pointer;
          padding: 10px 15px;
          margin: 5px;
        }
        
        .tablink.active {
          background-color: #294378;
          color: #fff;
        }
        
        .title-buttons-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
          padding: 20px 0;
        }
        
        .inner-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          padding: 20px;
        }
        
        .collection-card {
          text-align: center;
          padding: 15px;
          border: 1px solid #eee;
          border-radius: 8px;
        }
        
        .collection-card:hover {
          background-color: #294378;
          color: #fff;
        }
        
        .collection-image {
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .collection-image img {
          max-width: 100%;
          max-height: 100%;
          height: auto;
          border-radius: 4px;
          object-fit: contain;
        }
        
        .loading-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }
        
        .spinner {
          border: 6px solid #f3f3f3;
          border-top: 6px solid #294378;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .error-message {
          padding: 20px;
          background-color: #ffebee;
          border-radius: 8px;
          text-align: center;
          color: #d32f2f;
        }
        
        .error-message button {
          background-color: #294378;
          color: white;
          padding: 10px 15px;
          border: none;
          border-radius: 20px;
          margin-top: 15px;
          cursor: pointer;
        }
        
        .no-items {
          text-align: center;
          color: #666;
          grid-column: 1 / -1;
        }
      `}</style>
    </div>
  );
};

// Wait for DOM to be ready and mount the app
document.addEventListener('DOMContentLoaded', () => {
  // Try multiple potential container IDs
  const containerSelectors = ['#related-collections', '#container', '.related-collections-container'];
  let container = null;
  
  for (const selector of containerSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      container = element;
      console.log(`Container found with selector: ${selector}`);
      break;
    }
  }
  
  if (container) {
    console.log('Mounting React app to container');
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('No suitable container element found for the Related Collections app');
    console.info('Please add a container element with one of these selectors:', containerSelectors.join(', '));
  }
});
