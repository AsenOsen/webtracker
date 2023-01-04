import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const Form = () => {
    return (
        <form className="ui form" method="POST" action="add">
            <div className="field">
                <label>Add URL</label>
                <input type="text" name="url"/>
            </div>
            <button className="ui button" type="submit">Add URL</button>
        </form>
    )
}

const Table = () => {
    const [urls, setUrls] = useState({});
    useEffect(() => {
        fetch("/urls").then(res => res.json()).then((res) => setUrls(res));
    }, []);
    return (
        <table className="ui table" border="1">
            <tbody>
            { Object.entries(urls).map(([key, value]) => (
                <tr key={key}>
                    <td><a href={value.url} target="_blank">{value.url}</a></td>
                    <td><a href={"/snapshot?key=" + key}>Snapshot</a></td>
                    <td><Link to={"/view/" + key}>View</Link></td>
                    <td><a href={"/del?key=" + key}>Delete</a></td>
                </tr>
            ))}
            </tbody>
        </table>
    );
}

const Main = () => {
    return (
        <div className="ui one column container">
            <div className="column">
                <Form/>
                <Table/>
            </div>
        </div>    
    )
}

export default Main;