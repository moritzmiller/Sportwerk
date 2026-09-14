import { useEffect, useState } from 'react';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/daten')
      .then((response) => response.json())
      .then((fetchedData) => {
        console.log(fetchedData);
        setData(fetchedData);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Fehler beim Abrufen:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Lade Daten aus der SQLite-Datenbank...</p>;
  }

  return (
    <div className="table-card">
      <div className="table-header">
        <div>
          <h2>Naechste Spiele</h2>
        </div>
        <span className="badge">Top 4</span>
      </div>

      <table id="tss-game-widget">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Begegnung</th>
            <th>Zeit</th>
          </tr>
        </thead>

        <tbody>
          {data.slice(0, 4).map((game) => (
            <tr key={game.id}>
              <td className="date-cell">{game.date}</td>

              <td>
                <div className="game-infos">
                  <span className="team_left">{game.hometeam}</span>

                  <div className="score">
                    <span>{game.homegoals}</span>
                    <span className="colon">:</span>
                    <span>{game.awaygoals}</span>
                  </div>

                  <span className="team">{game.awayteam}</span>
                </div>
              </td>

              <td className="time-cell">{game.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
